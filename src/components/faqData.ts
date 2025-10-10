export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export const FAQ_ITEMS: ReadonlyArray<FaqItem> = [
  {
    id: "item-1",
    question: "Is it really uncensored?",
    answer:
      "100%. We believe in creative freedom and your privacy. No filters, no judgment, no exceptions. Go wild.",
  },
  {
    id: "item-2",
    question: "Is my data and are my chats private?",
    answer:
      "Absolutely. Your chats are your business. We use industry-standard AES-256 encryption for all data, and we have a strict policy against training our AI models on your private conversations. Your security is our top priority.",
  },
  {
    id: "item-3",
    question: "Is my payment information secure?",
    answer:
      "Absolutely. We use industry-standard SSL encryption for all transactions, and we never store your credit card details on our servers. Your security is our top priority.",
  },
  {
    id: "item-5",
    question: "How do I get started?",
    answer:
      "Getting started is simple! You can begin chatting with our AI characters immediately without creating an account. To access advanced features and create your own characters, simply sign up for free.",
  },
];
