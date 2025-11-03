
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const bookExcerptTool = createTool({
  id: 'get-book-excerpt',
  description: 'Search and fetch excerpts from public domain books via Project Gutenberg',
  inputSchema: z.object({
    query: z.string().describe('Search query: book title, author name, or topic'),
    maxResults: z.number().optional().default(5).describe('Maximum number of books to return'),
  }),
  outputSchema: z.object({
    books: z.array(
      z.object({
        id: z.number(),
        title: z.string(),
        authors: z.array(z.string()),
        subjects: z.array(z.string()),
        languages: z.array(z.string()),
        downloadCount: z.number(),
        formats: z.object({
          textPlain: z.string().optional(),
          textHtml: z.string().optional(),
        }),
        excerpt: z.string().optional(),
      })
    ),
    totalResults: z.number(),
  }),
  execute: async ({ context }) => {
    // Search for books using Gutendex API
    const searchUrl = `https://gutendex.com/books?search=${encodeURIComponent(context.query)}`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (!searchData.results || searchData.results.length === 0) {
      return {
        books: [],
        totalResults: 0,
      };
    }

    // Process up to maxResults books
    const booksToProcess = searchData.results.slice(0, context.maxResults || 5);
    const processedBooks = [];

    for (const book of booksToProcess) {
      const bookInfo = {
        id: book.id,
        title: book.title,
        authors: book.authors.map((author: any) => author.name),
        subjects: book.subjects || [],
        languages: book.languages || [],
        downloadCount: book.download_count || 0,
        formats: {
          textPlain: book.formats['text/plain; charset=utf-8'] || 
                     book.formats['text/plain; charset=us-ascii'] || 
                     book.formats['text/plain'],
          textHtml: book.formats['text/html'],
        },
        excerpt: undefined as string | undefined,
      };

      // Fetch excerpt from plain text version if available
      if (bookInfo.formats.textPlain) {
        try {
          const textResponse = await fetch(bookInfo.formats.textPlain);
          const fullText = await textResponse.text();
          
          // Extract a meaningful excerpt (skip front matter, get first ~500 characters of actual content)
          const lines = fullText.split('\n');
          let contentStart = 0;
          
          // Skip Project Gutenberg header (usually ends with "*** START OF")
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('*** START OF') || lines[i].includes('***START OF')) {
              contentStart = i + 1;
              break;
            }
          }
          
          // Get first substantial paragraph after header
          let excerpt = '';
          for (let i = contentStart; i < lines.length && excerpt.length < 500; i++) {
            const line = lines[i].trim();
            if (line.length > 50) { // Skip short lines (titles, chapter headings)
              excerpt += line + ' ';
            }
          }
          
          bookInfo.excerpt = excerpt.trim().substring(0, 500) + '...';
        } catch (error) {
          // If excerpt fetch fails, continue without it
          console.error(`Failed to fetch excerpt for book ${book.id}:`, error);
        }
      }

      processedBooks.push(bookInfo);
    }

    return {
      books: processedBooks,
      totalResults: searchData.count || 0,
    };
  },
});
