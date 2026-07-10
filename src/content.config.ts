import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 1. Schema for your Markdown blog posts
const blogCollection = defineCollection({
  // Tells Astro to look for Markdown files in the blog folder
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().default('—'),
    // Astro automatically parses standard YYYY-MM-DD dates into Date objects
    date: z.date().or(z.string()), 
    jalaliDate: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

// 2. Schema for your JSON comment files
const commentsCollection = defineCollection({
  // Tells Astro to look for JSON files in the comments folder
  loader: glob({ pattern: '**/*.json', base: './src/content/comments' }),
  schema: z.object({
    postSlug: z.string(),
    name: z.string(),
    // Transforms the ISO string from the JSON into a real Date object for sorting
    date: z.string().transform((str) => new Date(str)),
    message: z.string(),
    // Optional response block for when you want to reply
    adminResponse: z.object({
      date: z.string().transform((str) => new Date(str)),
      message: z.string()
    }).nullable().optional()
  }),
});

// 3. Export all collections so Astro can use them globally
export const collections = {
  'blog': blogCollection,
  'comments': commentsCollection,
};