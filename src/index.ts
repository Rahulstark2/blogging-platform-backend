import { Hono } from 'hono';
import { z } from 'zod';
import { PrismaClient } from "@prisma/client/edge";
import { withAccelerate } from '@prisma/extension-accelerate';
import { decode, sign, verify } from 'hono/jwt'
import { authMiddleware, CustomContext } from "./middleware"


interface Env {
  DATABASE_URL: string;
  DIRECT_URL?: string;
}

// Initialize Prisma client once with a placeholder DATABASE_URL
const prismaClient = (databaseUrl: string) => 
  new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl, // Access the DATABASE_URL through the context
      },
    },
  }).$extends(withAccelerate());

const app = new Hono<{ Bindings: Env }>();

const userSignupSchema = z.object({
  username: z.string().min(3, 'Username should have at least 3 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password should have at least 6 characters.')
});

const userSigninSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password should have at least 6 characters.')
})
const allowedTags = [
  "Tech Trends",
  "Productivity Tips",
  "Lifestyle Hacks",
  "Travel Adventures",
  "Health & Wellness",
  "Personal Development",
  "Creative Writing",
  "Sustainable Living",
  "Finance Tips",
  "Entrepreneurship"
] as const;

// Define the blog post schema
const blogPostSchema = z.object({
  title: z.string().min(3, 'Title should have at least 3 characters'),
  body: z.string().min(10, 'Body should have at least 10 characters'),
  tags: z
    .array(z.enum(allowedTags))  // Ensure tags are from the allowedTags list
    .max(10, "You can only choose up to 10 tags.")  // Limit to 10 tags
});

const blogUpdateSchema = z.object({
  title: z.string().min(3,'Title should have at least 3 characters'),
  body: z.string().min(10,'Body should have atleast 10 characters'),
  tags: z
    .array(z.enum(allowedTags))  // Ensure tags are from the allowedTags list
    .max(10, "You can only choose up to 10 tags.")  // Limit to 10 tags
})



app.post('/users/signup', async (c) => {
  try {
    // Access DATABASE_URL from c.env and create a PrismaClient instance
    const prisma = prismaClient(c.env.DATABASE_URL);
    
    const data = await c.req.json();
    const { username, email, password } = userSignupSchema.parse(data);

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email },
          { username: username }
        ]
      }
    });

    if (existingUser) {
      return c.json({ message: 'Email or username already exists' }, 400);
    } else {
      const newUser = await prisma.user.create({
        data: {
          username,
          email,
          password
        }
      });

      return c.json({ message: 'User created successfully', user: newUser }, 201);
    }
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      // Return validation errors with a 400 status
      return c.json({ message: error.errors }, 400);
    } else {
      // Handle other errors with a 500 status
      return c.json({ message: 'Internal server error' }, 500);
    }
  }
});

app.post('/users/signin', async (c) => {
  try {
    const prisma = prismaClient(c.env.DATABASE_URL);
    const data = await c.req.json();
    const { email, password } = userSigninSchema.parse(data);

    const user = await prisma.user.findUnique({
      where: {
        email: email,
        password: password
      }
    });

    if (user) {
      const payload = {
        id: user.id,
        email: user.email,
        password: user.password,
      };

      const secret = 'BLOG_SECRET'
      const token = await sign(payload, secret)

      return c.json({ message: 'Sign in successful', user: user,token: token });
    } else {
      return c.json({ message: 'Invalid email or password' }, 400);
    }
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return c.json({ message: error.errors }, 400);
    } else {
      return c.json({ message: 'Internal server error' }, 500);
    }
  }
});

app.post('/posts', authMiddleware, async (c: CustomContext) => {
  try {
    const prisma = prismaClient(c.env.DATABASE_URL);
    const data = await c.req.json();
    const { title, body, tags } = blogPostSchema.parse(data);
    const userId = c.get('user')?.id;
    if (!userId) {
      return c.json({ message: 'User ID is required' },400);
   }
   const newBlog = await prisma.blog.create({
        data: {
            title,
            body,
            tags,
            userId,  
        }
    });
    // Continue with post creation logic...
    return c.json({ message: 'Blog created successfully', userId });
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return c.json({ message: error.errors }, 400);
    } else {
      return c.json({ message: 'Internal server error' }, 500);
    }
  }
});

app.get('/posts', async (c) => {
  try {
    const prisma = prismaClient(c.env.DATABASE_URL);
    const blogs = await prisma.blog.findMany({
      select: {
        id: true,
        title: true,
        body: true,
        tags: true
      }
    })
    return c.json({ message: 'Blog fetched successfully', blog: blogs },200);

  } catch(error) {
    return c.json({message: 'Internal server error'},500);
   }
});

app.get('/myposts', authMiddleware, async (c: CustomContext) => {
  try{
    const prisma = prismaClient(c.env.DATABASE_URL);
    const data = await c.req.json();
    const userId = c.get('user')?.id;
    if (!userId) {
      return c.json({ message: 'User ID is required' },400);
   }
   const blog = await prisma.blog.findMany({
    where: {
        userId: userId, 
    },
    })
    return c.json({ message: 'Blog fetched successfully', todo: blog }, 200);



  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return c.json({ message: error.errors }, 400);
    } else {
      return c.json({ message: 'Internal server error' }, 500);
    }
  }
})

app.get('/posts/:id', async(c) => {
  try{
    const prisma = prismaClient(c.env.DATABASE_URL);
    const id = Number(c.req.param('id'));
    if (!id) {
      return c.json({ message: 'Blog id is required' },400);
   }

   const blog = await prisma.blog.findUnique({
    where: {
        id: id, 
    },
    })
    return c.json({ message: 'Blog fetched successfully', todo: blog }, 200);

  } catch(error) {
    return c.json({message: 'Internal server error'},500);
   }
})

app.put('/posts/:id', authMiddleware, async (c: CustomContext) => {
  try{
    const prisma = prismaClient(c.env.DATABASE_URL);
    const data = await c.req.json();
    const {title, body, tags} = blogPostSchema.parse(data);
    const userId = c.get('user')?.id;
    const id = Number(c.req.param('id'));
    if (!userId) {
      return c.json({ message: 'User ID is required' },400);
   }
   const updatedTodo = await prisma.blog.update({
    where: { userId: userId,
             id: id,
    },
    data: {
        title,
        body,
        tags
      }
    });

    return c.json({ message: 'Blog updated successfully', todo: data }, 200);
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return c.json({ message: error.errors }, 400);
    } else {
      return c.json({ message: 'Internal server error' }, 500);
    }
  }

})

app.delete('/posts/:id', authMiddleware, async (c: CustomContext) => {
try{
  const prisma = prismaClient(c.env.DATABASE_URL);
  const userId = c.get('user')?.id;
  const id = Number(c.req.param('id'));
  if (!userId) {
    return c.json({ message: 'User ID is required' },400);
 }

 const deletedPost = await prisma.blog.delete({
  where: {
          id: id,
          userId: userId,
  },
});

return c.json({ message: 'Blog deleted successfully', todo: deletedPost }, 200);
} catch(error) {
  return c.json({message: 'Internal server error'},500);
 }

})




export default app;
