
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQ_ITEMS } from "@/components/faqData";
import type { FaqItem } from "@/components/faqData";

export default function FAQ() {

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
          {FAQ_ITEMS.map((item: FaqItem) => (
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
}
