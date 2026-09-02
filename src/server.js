const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { checkDatabaseConnection } = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const organizerRoutes = require('./routes/organizerRoutes');
const eventRoutes = require('./routes/eventRoutes');
const organizerEventRoutes = require('./routes/organizerEventRoutes');
const hostRequestRoutes = require('./routes/hostRequestRoutes');
const registrationRoutes = require('./routes/registrationRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const checkinRoutes = require('./routes/checkinRoutes');
const organizerDashboardRoutes = require('./routes/organizerDashboardRoutes');
const profileRoutes = require('./routes/profileRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const passport = require('./config/passport');

dotenv.config();

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://festora-frontend.onrender.com'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(passport.initialize());

// Root & Health Check Endpoints
app.get('/', (req, res) => {
  res.json({
    message: "Festora Backend is running"
  });
});

app.get('/api/health', async (req, res) => {
  const dbStatus = await checkDatabaseConnection();
  if (dbStatus.success) {
    return res.json({
      backend: "running",
      database: "connected"
    });
  } else {
    return res.status(500).json({
      backend: "running",
      database: "disconnected",
      details: dbStatus.error || "MySQL connection failed. Please verify credentials in .env and ensure MySQL server is running and database 'festora' exists."
    });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/organizer/events', organizerEventRoutes);
app.use('/api/organizer/events', checkinRoutes);
app.use('/api/organizer/notifications', notificationRoutes);
app.use('/api/organizer/host-event-requests', hostRequestRoutes);
app.use('/api/organizer', organizerRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/student', registrationRoutes);
app.use('/api/student', ticketRoutes);
app.use('/api/student', profileRoutes);
app.use('/api/host-requests', hostRequestRoutes);
app.use('/api/host-event-requests', hostRequestRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Festora Backend running on port ${PORT}`);
  const dbStatus = await checkDatabaseConnection();
  if (dbStatus.success) {
    console.log('MySQL connected successfully');
  } else {
    console.error(`MySQL Connection Error: ${dbStatus.error}`);
  }
});
