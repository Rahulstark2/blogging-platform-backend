import { Context, Next } from 'hono';
import { verify } from 'hono/jwt';

interface CustomContext extends Context {
  set(key: 'user', value: any): void;
}

export const authMiddleware = async (c: CustomContext, next: Next) => {
  try {
    const authorizationHeader = c.req.header('Authorization');

    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return c.json({ message: 'Access Denied. No token provided.' }, 401);
    }

    const token = authorizationHeader.slice(7);

    const decoded = await verify(token, 'BLOG_SECRET');
    if (decoded) {
      c.set('user', decoded); 
      await next();
    } else {
      return c.body('You are an unauthorized user, sorry', 401);
    }
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Invalid Token' }, 400);
  }
};

export { CustomContext };
