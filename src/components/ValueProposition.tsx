import { Unlock, Palette, Brain } from "lucide-react";
const ValueProposition = () => {
  const benefits = [{
    icon: Unlock,
    title: "Truly Uncensored Chat",
    description: "Tired of filters? So are we. Our AI companions say what they mean. Explore any topic, any fantasy, without limits. The only boundary is your imagination."
  }, {
    icon: Palette,
    title: "Craft Your Dream Character",
    description: "From shy anime heroines to battle-hardened space marines, you're the creator. Tweak every detail of their personality, backstory, and appearance. Bring your ultimate OC to life."
  }, {
    icon: Brain,
    title: "Next-Gen AI Immersion",
    description: "Powered by cutting-edge language models, our AI remembers, adapts, and feels more real than ever. Experience conversations with depth and continuity that will blow your mind."
  }];
  return <section className="py-16 sm:py-20 lg:py-24 px-4 sm:px-6 bg-[#121212]">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16 sm:mb-20">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
            Why Choose Our Platform?
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Experience the freedom of truly uncensored AI conversations
          </p>
        </div>

        {/* Alternating Layout */}
        <div className="space-y-20 lg:space-y-32">
          {benefits.map((benefit, index) => <div key={index} className={`grid lg:grid-cols-2 gap-12 lg:gap-16 items-center ${index % 2 === 1 ? 'lg:grid-flow-dense' : ''}`}>
              {/* Icon and Visual Side */}
              <div className={`relative ${index % 2 === 1 ? 'lg:col-start-2' : ''}`}>
                <div className="relative w-full max-w-md mx-auto">
                  {/* Large Background Circle */}
                  <div className="w-30 h-30 mx-auto bg-gradient-to-br from-[#FF7A00]/10 to-[#FF7A00]/5 rounded-full flex items-center justify-center relative">
                    {/* Inner Circle */}
                    <div className="w-48 h-48 bg-[#1a1a2e] border-2 border-[#FF7A00]/30 rounded-full flex items-center justify-center relative">
                      <benefit.icon className="w-20 h-20 text-[#FF7A00] filter drop-shadow-[0_0_12px_rgba(255,122,0,0.8)]" strokeWidth={1} />
                      {/* Animated rings */}
                      <div className="absolute inset-0 rounded-full border border-[#FF7A00]/20 animate-pulse"></div>
                      <div style={{
                    animationDelay: '1s'
                  }} className="absolute inset-[-8px] border border-[#FF7A00]/10 animate-pulse rounded-full"></div>
                    </div>
                    {/* Floating particles */}
                    <div className="absolute top-8 right-8 w-3 h-3 bg-[#FF7A00]/60 rounded-full animate-pulse"></div>
                    <div className="absolute bottom-12 left-12 w-2 h-2 bg-[#FF7A00]/40 rounded-full animate-pulse" style={{
                  animationDelay: '2s'
                }}></div>
                    <div className="absolute top-16 left-8 w-1 h-1 bg-[#FF7A00]/50 rounded-full animate-pulse" style={{
                  animationDelay: '3s'
                }}></div>
                  </div>
                </div>
              </div>

              {/* Content Side */}
              <div className={`text-center lg:text-left ${index % 2 === 1 ? 'lg:col-start-1' : ''}`}>
                <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-6 leading-tight">
                  {benefit.title}
                </h3>
                <p className="text-lg sm:text-xl text-gray-300 leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0">
                  {benefit.description}
                </p>
                {/* Feature highlight bar */}
                <div className="flex items-center justify-center lg:justify-start">
                  <div className="h-1 w-20 bg-gradient-to-r from-[#FF7A00] to-[#FF7A00]/50 rounded-full"></div>
                </div>
              </div>
            </div>)}
        </div>
      </div>
    </section>;
};
export default ValueProposition;