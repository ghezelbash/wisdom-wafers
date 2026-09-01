import { Lesson } from '../models/lesson';

export const mockLessons: Record<string, Lesson> = {
  'mock-id': {
    id: 'mock-id',
    topicId: 'philosophy-101',
    title: 'Introduction to Stoicism',
    description: 'Learn the basics of Stoic philosophy in 3 minutes.',
    cards: [
      {
        id: 'card-1',
        type: 'text',
        content: 'Stoicism is an ancient Greek philosophy that teaches the development of self-control and fortitude as a means of overcoming destructive emotions.',
      },
      {
        id: 'card-2',
        type: 'image',
        imageUrl: 'https://images.unsplash.com/photo-1549887552-cb1071d3e5ca?q=80&w=800&auto=format&fit=crop', // A statue or Greek architecture
        caption: 'Marcus Aurelius, one of the most famous Stoic philosophers.',
      },
      {
        id: 'card-3',
        type: 'text',
        content: 'The core idea is simple: You cannot control what happens to you, but you can control how you react to it.',
      },
      {
        id: 'card-4',
        type: 'quiz',
        question: 'According to Stoicism, what is the only thing you have complete control over?',
        options: [
          { id: 'opt-1', text: 'The actions of others', isCorrect: false },
          { id: 'opt-2', text: 'The weather', isCorrect: false },
          { id: 'opt-3', text: 'Your own thoughts and reactions', isCorrect: true },
          { id: 'opt-4', text: 'Your physical health', isCorrect: false },
        ],
        explanation: 'Stoics believe our own mind is our only true domain of control.',
      },
      {
        id: 'card-5',
        type: 'text',
        content: 'Congratulations! You have completed your first Wisdom Wafer.',
      }
    ]
  }
};
