
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const SubscriptionTestimonials = () => {
  const testimonials = [
    {
      text: "The 16K context on the Whale tier is a game-changer for long-form RP. My character remembers everything. Worth every penny.",
      author: "@LoreMaster_Flex",
      tier: "The Whale",
      tierColor: "bg-purple-600"
    },
    {
      text: "No ads and unlimited messages completely transformed my experience. I can finally have uninterrupted conversations with my AI companions.",
      author: "@ChatAddict_2024",
      tier: "True Fan",
      tierColor: "bg-[#FF7A00]"
    },
    {
      text: "Premium AI models respond so much better to complex scenarios. The quality difference is night and day compared to free tier.",
      author: "@AIEnthusiast_Pro",
      tier: "True Fan",
      tierColor: "bg-[#FF7A00]"
    }
  ];

  return (
    <section className="py-16 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            What Our Supporters Are Saying
          </h2>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Real testimonials from users who've upgraded to unlock the full potential of their AI companions.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <Card 
              key={index}
              className="bg-[#1a1a2e] border-gray-700/50 hover:border-[#FF7A00]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[#FF7A00]/10"
            >
              <CardContent className="p-6">
                {/* Testimonial Text */}
                <blockquote className="text-gray-300 leading-relaxed mb-4 text-sm sm:text-base">
                  "{testimonial.text}"
                </blockquote>
                
                {/* Author and Tier */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-[#FF7A00] font-medium text-sm">
                      {testimonial.author}
                    </span>
                  </div>
                  <Badge 
                    className={`${testimonial.tierColor} text-white text-xs px-2 py-1 font-bold`}
                  >
                    {testimonial.tier}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Call to Action */}
        <div className="text-center mt-8">
          <p className="text-sm text-gray-400">
            Join thousands of satisfied users who've upgraded their AI experience
          </p>
        </div>
      </div>
    </section>
  );
};
