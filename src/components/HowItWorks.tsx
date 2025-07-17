
import { Plus, Heart, MessageSquare } from "lucide-react";

const HowItWorks = () => {
  const steps = [
    {
      number: 1,
      icon: Plus,
      title: "Create Your Legend",
      description: "A quick, painless sign-up gets you into the action."
    },
    {
      number: 2,
      icon: Heart,
      title: "Choose Your Waifu/Husbando",
      description: "Pick from a massive library of community creations or build your own from scratch."
    },
    {
      number: 3,
      icon: MessageSquare,
      title: "Enter the Simulation",
      description: "Dive into limitless conversations and explore where your imagination takes you."
    }
  ];

  return (
    <section className="py-16 sm:py-20 lg:py-24 px-4 sm:px-6 bg-[#1a1a2e]">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16 sm:mb-20">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
            Start Your Adventure in 3 Steps
          </h2>
        </div>

        {/* Steps Container */}
        <div className="relative">
          {/* Desktop: Horizontal Layout with Connection Line */}
          <div className="hidden md:block">
            {/* Connection Line */}
            <div className="absolute top-24 left-1/6 right-1/6 h-0.5 bg-gradient-to-r from-transparent via-[#FF7A00] to-transparent opacity-60">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FF7A00] to-transparent opacity-50 animate-pulse" style={{
                backgroundImage: 'radial-gradient(circle, #FF7A00 1px, transparent 1px)',
                backgroundSize: '8px 8px'
              }}></div>
            </div>
            
            {/* Steps Grid */}
            <div className="grid grid-cols-3 gap-8 lg:gap-12">
              {steps.map((step, index) => (
                <div key={index} className="text-center relative">
                  {/* Step Number */}
                  <div className="mb-6 flex justify-center">
                    <div className="text-3xl sm:text-4xl font-bold text-[#FF7A00]">{step.number}</div>
                  </div>

                  {/* Circular Icon Container */}
                  <div className="relative mb-8 flex justify-center">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 bg-[#121212] border-3 border-[#FF7A00] rounded-full flex items-center justify-center shadow-lg relative z-10 group">
                      <step.icon className="w-10 h-10 sm:w-12 sm:h-12 text-[#FF7A00]" strokeWidth={2} />
                      {/* Glow effect */}
                      <div className="absolute inset-0 rounded-full bg-[#FF7A00]/20 blur-md opacity-70 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-4">
                    {step.title}
                  </h3>

                  {/* Description */}
                  <p className="text-base sm:text-lg text-gray-300 leading-relaxed max-w-xs mx-auto">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile: Vertical Layout */}
          <div className="md:hidden">
            <div className="space-y-12 sm:space-y-16">
              {steps.map((step, index) => (
                <div key={index} className="text-center relative">
                  {/* Step Number */}
                  <div className="mb-6">
                    <div className="text-2xl sm:text-3xl font-bold text-[#FF7A00]">{step.number}</div>
                  </div>

                  {/* Circular Icon Container */}
                  <div className="relative mb-6 flex justify-center">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 bg-[#121212] border-3 border-[#FF7A00] rounded-full flex items-center justify-center shadow-lg relative z-10 group">
                      <step.icon className="w-8 h-8 sm:w-10 sm:h-10 text-[#FF7A00]" strokeWidth={2} />
                      {/* Glow effect */}
                      <div className="absolute inset-0 rounded-full bg-[#FF7A00]/20 blur-md opacity-70 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-lg sm:text-xl font-bold text-white mb-3">
                    {step.title}
                  </h3>

                  {/* Description */}
                  <p className="text-sm sm:text-base text-gray-300 leading-relaxed max-w-sm mx-auto">
                    {step.description}
                  </p>

                  {/* Connecting line for mobile (except last item) */}
                  {index < steps.length - 1 && (
                    <div className="flex justify-center mt-8">
                      <div className="w-0.5 h-8 bg-gradient-to-b from-[#FF7A00] to-[#FF7A00]/30"></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
