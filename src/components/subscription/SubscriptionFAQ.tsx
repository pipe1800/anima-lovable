
import React from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const SubscriptionFAQ = () => {
  const faqItems = [
    {
      id: "message-count",
      question: "What counts as a message?",
      answer: "Every time you send a message or regenerate an AI response, it counts as one message towards your daily limit."
    },
    {
      id: "payment-methods",
      question: "What payment methods do you accept?",
      answer: "We currently accept all major credit/debit cards and PayPal for all subscription plans."
    },
    {
      id: "change-plan",
      question: "Can I change my plan later?",
      answer: "Absolutely! You can upgrade or downgrade your plan at any time from your account settings. When upgrading, you'll be charged the prorated difference immediately. When downgrading, the change takes effect at your next billing cycle, so you keep your current benefits until then."
    },
    {
      id: "money-back",
      question: "How does the 30-day money-back guarantee work?",
      answer: "If you're not completely satisfied with your subscription within the first 30 days, simply contact our support team and we'll process a full refund, no questions asked. You'll continue to have access to your paid features until the refund is processed."
    },
    {
      id: "cancel-subscription",
      question: "What happens if I cancel my subscription?",
      answer: "When you cancel, your subscription remains active until the end of your current billing period, so you keep all your paid benefits. After that, your account automatically switches to the free Guest Pass tier. Your characters and chat history are preserved for 30 days in case you want to reactivate."
    }
  ];

  return (
    <section className="py-16 px-4 sm:px-6 border-t border-gray-700/30">
      <div className="max-w-4xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Billing Questions? We Got You.
          </h2>
          <p className="text-lg text-gray-300">
            Everything you need to know about payments, plans, and refunds.
          </p>
        </div>

        {/* FAQ Accordion */}
        <Accordion type="single" collapsible className="w-full">
          {faqItems.map((item) => (
            <AccordionItem 
              key={item.id} 
              value={item.id}
              className="border-b border-gray-700/50 last:border-b-0"
            >
              <AccordionTrigger className="text-left py-6 hover:no-underline [&[data-state=open]>svg]:text-[#FF7A00] [&>svg]:text-[#FF7A00]">
                <span className="text-lg font-semibold text-white pr-4">
                  {item.question}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-6 text-gray-300 leading-relaxed">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {/* Contact Support CTA */}
        <div className="text-center mt-12 pt-8 border-t border-gray-700/30">
          <p className="text-gray-300 mb-4">
            Still have questions? We're here to help.
          </p>
          <a 
            href="mailto:support@example.com" 
            className="inline-flex items-center px-6 py-3 bg-[#FF7A00] text-white font-semibold rounded-lg hover:bg-[#FF7A00]/90 transition-colors"
          >
            Contact Support
          </a>
        </div>
      </div>
    </section>
  );
};
