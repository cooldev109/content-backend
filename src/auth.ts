import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from './db.js';
import type { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = '7d';

export interface AuthUser {
  id: number;
  username: string;
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function verifyUser(username: string, password: string): Promise<AuthUser | null> {
  const result = await query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) return null;

  return { id: row.id, username: row.username };
}

export async function createUser(username: string, password: string): Promise<AuthUser> {
  const hash = await bcrypt.hash(password, 10);
  const result = await query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
    [username, hash]
  );
  return result.rows[0];
}

export function generateToken(user: AuthUser): string {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
