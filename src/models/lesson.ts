export type CardType = 'text' | 'image' | 'quiz';

export interface BaseCard {
  id: string;
  type: CardType;
}

export interface TextCard extends BaseCard {
  type: 'text';
  content: string;
}

export interface ImageCard extends BaseCard {
  type: 'image';
  imageUrl: string;
  caption?: string;
}

export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizCard extends BaseCard {
  type: 'quiz';
  question: string;
  options: QuizOption[];
  explanation?: string;
}

export type WaferCard = TextCard | ImageCard | QuizCard;

export interface Lesson {
  id: string;
  topicId: string;
  title: string;
  description: string;
  cards: WaferCard[];
}
