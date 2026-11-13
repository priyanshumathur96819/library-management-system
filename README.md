# BookNest — Library Management System

A full-stack, single-service library management application built with Node.js, Express, MongoDB, JWT and a responsive browser UI. Express serves the frontend and API from the same origin, so the deployed app has one public URL.

## Features
- Student registration and login; admin login
- Admin dashboard, catalogue CRUD, student directory
- Book issue and return workflows; 14-day due dates and ₹5/day late fine calculation
- Student self-service catalogue, borrow/return history and personal dashboard
- Search, responsive layout, seeded starter catalogue
- MongoDB persistence, hashed passwords, JWT-protected APIs

## Local run
1. Install Node.js 20+.
2. Create a MongoDB database (MongoDB Atlas or local MongoDB).
3. Copy `.env.example` to `.env` and set `MONGODB_URI`, `JWT_SECRET`, and `ADMIN_PASSWORD`.
4. Run `npm install` and `npm start`.
5. Open `http://localhost:10000`.

## Deploy as one link (Render)
1. Push this folder to a GitHub repository.
2. In Render, create a new **Blueprint** from that repository; Render reads `render.yaml`.
3. Set `MONGODB_URI` to your MongoDB Atlas connection string and set a strong `ADMIN_PASSWORD` in the Render environment settings.
4. Deploy. The single Render service serves both frontend and backend at the same URL.

## Default admin (change before production)
- Email: `admin@library.demo`
- Password: `Library@123`

The initial admin is created automatically on first database connection. Do not use the demo password with real data. Restrict MongoDB Atlas network access to the deployment provider as appropriate.
