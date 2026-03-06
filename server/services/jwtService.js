const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'agrishield_secret_change_in_prod';
const JWT_EXPIRES = '7d';

const hashPassword = (password) => bcrypt.hash(password, 12);

const comparePassword = (password, hash) => bcrypt.compare(password, hash);

const generateToken = (userId, role) =>
  jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

const verifyToken = (token) => jwt.verify(token, JWT_SECRET);

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
};

