import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'agrishield_secret_change_in_prod';
const JWT_EXPIRES = '7d';

export const hashPassword = (password: string) =>
  bcrypt.hash(password, 12);

export const comparePassword = (password: string, hash: string) =>
  bcrypt.compare(password, hash);

export const generateToken = (userId: string, role: string) =>
  jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

export const verifyToken = (token: string) =>
  jwt.verify(token, JWT_SECRET) as { userId: string; role: string };

