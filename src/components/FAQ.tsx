
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ = () => {
  const faqItems = [
    {
      id: "item-1",
      question: "Is it really uncensored?",
      answer: "100%. We believe in creative freedom and your privacy. No filters, no judgment, no exceptions. Go wild."
    },
    {
      id: "item-2", 
      question: "Is my data and are my chats private?",
      answer: "Absolutely. Your chats are your business. We use industry-standard AES-256 encryption for all data, and we have a strict policy against training our AI models on your private conversations. Your security is our top priority."
    },
    {
      id: "item-3",
      question: "Is my payment information secure?",
      answer: "Absolutely. We use industry-standard SSL encryption for all transactions, and we never store your credit card details on our servers. Your security is our top priority."
    },
    {
      id: "item-4",
      question: "What is your refund policy?",
      answer: "We offer a 30-day, no-questions-asked money-back guarantee. If you're not completely satisfied with your purchase, simply contact us within 30 days for a full refund."
    },
    {
      id: "item-5",
      question: "How do I get started?",
      answer: "Getting started is simple! You can begin chatting with our AI characters immediately without creating an account. To access advanced features and create your own characters, simply sign up for free."
    }
  ];

  return (
    <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 bg-[#121212]">
      <div className="max-w-4xl mx-auto">
        {/* Headline */}
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4">
            The Deets: Your Questions Answered.
          </h2>
        </div>

        {/* FAQ Accordion */}
        <Accordion type="single" collapsible className="w-full">
          {faqItems.map((item) => (
            <AccordionItem 
              key={item.id} 
              value={item.id}
              className="border-b border-gray-700 last:border-b-0"
            >
              <AccordionTrigger className="text-left py-4 sm:py-6 hover:no-underline min-h-[44px] [&[data-state=open]>svg]:text-[#FF7A00] [&>svg]:text-[#FF7A00]">
                <span className="text-base sm:text-lg font-bold text-white pr-4">
                  {item.question}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 sm:pb-6 text-sm sm:text-base text-gray-300 leading-relaxed">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};

export default FAQ;
