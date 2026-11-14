
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();

app.use(express.json({ limit: '1mb' }));

// Serve frontend files
app.use(express.static(path.join(__dirname, 'public')));

// ==================== DATABASE MODELS ====================

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['admin', 'student'],
    default: 'student'
  },
  createdAt: { type: Date, default: Date.now }
});

const BookSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  author: { type: String, required: true, trim: true },
  isbn: { type: String, default: '' },
  category: { type: String, default: 'General' },
  totalCopies: { type: Number, default: 1, min: 0 },
  availableCopies: { type: Number, default: 1, min: 0 },
  cover: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const LoanSchema = new mongoose.Schema({
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  issueDate: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
  returnDate: { type: Date, default: null },
  status: {
    type: String,
    enum: ['issued', 'returned'],
    default: 'issued'
  },
  fine: { type: Number, default: 0 }
});

const User = mongoose.model('User', UserSchema);
const Book = mongoose.model('Book', BookSchema);
const Loan = mongoose.model('Loan', LoanSchema);

// ==================== HELPERS ====================

const asyncRoute = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const JWT_SECRET = process.env.JWT_SECRET;

const tokenFor = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      name: user.name,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '');

  try {
    if (!token) {
      return res.status(401).json({
        message: 'Please sign in to continue.'
      });
    }

    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({
      message: 'Invalid or expired login session.'
    });
  }
}

function admin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      message: 'Admin access required.'
    });
  }

  next();
}

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database:
      mongoose.connection.readyState === 1
        ? 'connected'
        : 'disconnected'
  });
});

// ==================== AUTH ROUTES ====================

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { name, email, password } = req.body;

  if (
    !name ||
    !email ||
    !password ||
    String(password).length < 6
  ) {
    return res.status(400).json({
      message: 'Name, valid email and password of at least 6 characters are required.'
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const existingUser = await User.findOne({
    email: normalizedEmail
  });

  if (existingUser) {
    return res.status(409).json({
      message: 'An account with this email already exists.'
    });
  }

  const user = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    password: await bcrypt.hash(password, 10),
    role: 'student'
  });

  res.status(201).json({
    token: tokenFor(user),
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({
    email: String(email || '').trim().toLowerCase()
  });

  if (
    !user ||
    !await bcrypt.compare(String(password || ''), user.password)
  ) {
    return res.status(401).json({
      message: 'Invalid email or password.'
    });
  }

  res.json({
    token: tokenFor(user),
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
}));

app.get('/api/auth/me', auth, asyncRoute(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');

  if (!user) {
    return res.status(404).json({
      message: 'Account not found.'
    });
  }

  res.json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
}));

// ==================== BOOK ROUTES ====================

app.get('/api/books', asyncRoute(async (req, res) => {
  const q = String(req.query.q || '').trim();

  const filter = q
    ? {
        $or: [
          { title: { $regex: q, $options: 'i' } },
          { author: { $regex: q, $options: 'i' } },
          { category: { $regex: q, $options: 'i' } },
          { isbn: { $regex: q, $options: 'i' } }
        ]
      }
    : {};

  const books = await Book.find(filter).sort({ createdAt: -1 });

  res.json(books);
}));

app.post('/api/books', auth, admin, asyncRoute(async (req, res) => {
  const {
    title,
    author,
    isbn,
    category,
    totalCopies,
    cover
  } = req.body;

  if (!title || !author) {
    return res.status(400).json({
      message: 'Book title and author are required.'
    });
  }

  const count = Math.max(0, Number(totalCopies ?? 1));

  if (!Number.isInteger(count)) {
    return res.status(400).json({
      message: 'Total copies must be a whole number.'
    });
  }

  const book = await Book.create({
    title,
    author,
    isbn,
    category,
    totalCopies: count,
    availableCopies: count,
    cover
  });

  res.status(201).json(book);
}));

app.put('/api/books/:id', auth, admin, asyncRoute(async (req, res) => {
  const book = await Book.findById(req.params.id);

  if (!book) {
    return res.status(404).json({
      message: 'Book not found.'
    });
  }

  const activeLoans = book.totalCopies - book.availableCopies;
  const requestedCopies = Number(
    req.body.totalCopies ?? book.totalCopies
  );

  if (
    !Number.isInteger(requestedCopies) ||
    requestedCopies < activeLoans
  ) {
    return res.status(400).json({
      message: 'Total copies cannot be less than currently issued copies.'
    });
  }

  book.title = req.body.title ?? book.title;
  book.author = req.body.author ?? book.author;
  book.isbn = req.body.isbn ?? book.isbn;
  book.category = req.body.category ?? book.category;
  book.cover = req.body.cover ?? book.cover;
  book.totalCopies = requestedCopies;
  book.availableCopies = requestedCopies - activeLoans;

  await book.save();

  res.json(book);
}));

app.delete('/api/books/:id', auth, admin, asyncRoute(async (req, res) => {
  const activeLoan = await Loan.exists({
    book: req.params.id,
    status: 'issued'
  });

  if (activeLoan) {
    return res.status(409).json({
      message: 'This book has active loans and cannot be deleted.'
    });
  }

  const book = await Book.findByIdAndDelete(req.params.id);

  if (!book) {
    return res.status(404).json({
      message: 'Book not found.'
    });
  }

  res.json({ message: 'Book deleted successfully.' });
}));

// ==================== STUDENT ROUTES ====================

app.get('/api/students', auth, admin, asyncRoute(async (req, res) => {
  const students = await User.find({ role: 'student' })
    .select('-password')
    .sort({ createdAt: -1 });

  res.json(students);
}));

// ==================== LOAN ROUTES ====================

app.get('/api/loans', auth, asyncRoute(async (req, res) => {
  const filter = req.user.role === 'admin'
    ? {}
    : { student: req.user.id };

  const loans = await Loan.find(filter)
    .populate('book')
    .populate('student', 'name email')
    .sort({ issueDate: -1 });

  res.json(loans);
}));

app.post('/api/loans', auth, asyncRoute(async (req, res) => {
  const { bookId, studentId } = req.body;

  if (!mongoose.isValidObjectId(bookId)) {
    return res.status(400).json({
      message: 'Invalid book ID.'
    });
  }

  const student = req.user.role === 'admin' && studentId
    ? studentId
    : req.user.id;

  if (!mongoose.isValidObjectId(student)) {
    return res.status(400).json({
      message: 'Invalid student ID.'
    });
  }

  const book = await Book.findById(bookId);

  if (!book) {
    return res.status(404).json({
      message: 'Book not found.'
    });
  }

  if (book.availableCopies < 1) {
    return res.status(409).json({
      message: 'No copies are currently available.'
    });
  }

  const existingLoan = await Loan.exists({
    book: bookId,
    student,
    status: 'issued'
  });

  if (existingLoan) {
    return res.status(409).json({
      message: 'This student already has this book issued.'
    });
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 14);

  const loan = await Loan.create({
    book: bookId,
    student,
    dueDate
  });

  book.availableCopies -= 1;
  await book.save();

  res.status(201).json(
    await loan.populate(['book', 'student'])
  );
}));

app.post('/api/loans/:id/return', auth, asyncRoute(async (req, res) => {
  const loan = await Loan.findById(req.params.id);

  if (!loan) {
    return res.status(404).json({
      message: 'Loan not found.'
    });
  }

  if (
    req.user.role !== 'admin' &&
    String(loan.student) !== req.user.id
  ) {
    return res.status(403).json({
      message: 'You cannot return this loan.'
    });
  }

  if (loan.status === 'returned') {
    return res.status(409).json({
      message: 'This book is already returned.'
    });
  }

  loan.status = 'returned';
  loan.returnDate = new Date();

  const lateDays = Math.max(
    0,
    Math.ceil((loan.returnDate - loan.dueDate) / 86400000)
  );

  loan.fine = lateDays * 5;

  await loan.save();

  await Book.findByIdAndUpdate(
    loan.book,
    { $inc: { availableCopies: 1 } }
  );

  res.json(
    await loan.populate(['book', 'student'])
  );
}));

// ==================== DASHBOARD ====================

app.get('/api/dashboard', auth, asyncRoute(async (req, res) => {
  if (req.user.role === 'admin') {
    const [books, students, active, overdue] = await Promise.all([
      Book.countDocuments(),
      User.countDocuments({ role: 'student' }),
      Loan.countDocuments({ status: 'issued' }),
      Loan.countDocuments({
        status: 'issued',
        dueDate: { $lt: new Date() }
      })
    ]);

    return res.json({
      books,
      students,
      active,
      overdue
    });
  }

  const [active, returned, overdue] = await Promise.all([
    Loan.countDocuments({
      student: req.user.id,
      status: 'issued'
    }),
    Loan.countDocuments({
      student: req.user.id,
      status: 'returned'
    }),
    Loan.countDocuments({
      student: req.user.id,
      status: 'issued',
      dueDate: { $lt: new Date() }
    })
  ]);

  res.json({
    active,
    returned,
    overdue
  });
}));

// ==================== FRONTEND FALLBACK ====================

// Express 4 and Express 5 compatible fallback
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      message: 'API route not found.'
    });
  }

  res.sendFile(
    path.join(__dirname, 'public', 'index.html'),
    (err) => {
      if (err) next(err);
    }
  );
});

// ==================== ERROR HANDLER ====================

app.use((err, req, res, next) => {
  console.error(err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: err.message
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      message: 'Invalid ID provided.'
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      message: 'That record already exists.'
    });
  }

  res.status(500).json({
    message: 'Something went wrong. Please try again.'
  });
});

// ==================== START SERVER ====================

async function start() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing.');
  }

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing.');
  }

  if (!process.env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD is missing.');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  console.log('MongoDB connected successfully.');

  const email = (
    process.env.ADMIN_EMAIL || 'admin@library.demo'
  ).toLowerCase();

  let adminUser = await User.findOne({ email });

  if (!adminUser) {
    adminUser = await User.create({
      name: process.env.ADMIN_NAME || 'Library Admin',
      email,
      password: await bcrypt.hash(process.env.ADMIN_PASSWORD, 10),
      role: 'admin'
    });

    console.log('Initial admin account created:', email);
  }

  if (await Book.countDocuments() === 0) {
    await Book.insertMany([
      {
        title: 'The Alchemist',
        author: 'Paulo Coelho',
        category: 'Fiction',
        isbn: '9780061122415',
        totalCopies: 5,
        availableCopies: 5
      },
      {
        title: 'Atomic Habits',
        author: 'James Clear',
        category: 'Self Help',
        isbn: '9780735211292',
        totalCopies: 4,
        availableCopies: 4
      },
      {
        title: 'Clean Code',
        author: 'Robert C. Martin',
        category: 'Technology',
        isbn: '9780132350884',
        totalCopies: 3,
        availableCopies: 3
      },
      {
        title: 'A Brief History of Time',
        author: 'Stephen Hawking',
        category: 'Science',
        isbn: '9780553380163',
        totalCopies: 2,
        availableCopies: 2
      },
      {
        title: 'The Pragmatic Programmer',
        author: 'David Thomas',
        category: 'Technology',
        isbn: '9780135957059',
        totalCopies: 3,
        availableCopies: 3
      }
    ]);

    console.log('Sample books added.');
  }

  const PORT = process.env.PORT || 10000;

  app.listen(PORT, () => {
    console.log(`Library system running on port ${PORT}`);
  });
}

start().catch((error) => {
  console.error('Startup failed:', error.message);
  process.exit(1);
});
