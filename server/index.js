const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');
const authRouter = require('./routes/auth');
const weatherRouter = require('./routes/weather');
const riskRouter = require('./routes/risk');
const insuranceRouter = require('./routes/insurance');
const adminLogsRouter = require('./routes/adminLogs');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/', apiLimiter);
app.use('/auth/', authLimiter);

app.use('/auth', authRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/risk', riskRouter);
app.use('/api/insurance', insuranceRouter);
app.use('/api/admin', adminLogsRouter);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`AgriShield backend running on port ${PORT}`);
});

