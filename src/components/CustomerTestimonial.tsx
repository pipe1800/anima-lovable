
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Lock, Shield, Database } from "lucide-react";

const CustomerTestimonial = () => {
  return (
    <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 bg-[#1a1a2e]">
      <div className="max-w-6xl mx-auto">
        {/* Main Testimonial */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 items-center mb-16 sm:mb-20">
          {/* Left Column - Customer Photo */}
          <div className="flex justify-center order-1 lg:order-1">
            <div className="relative">
              <Avatar className="w-32 h-32 sm:w-40 sm:h-40 lg:w-48 lg:h-48 xl:w-56 xl:h-56 shadow-2xl border-4 border-[#FF7A00]/20">
                <AvatarImage 
                  src="https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=400&h=400&fit=crop&crop=face" 
                  alt="Gaming enthusiast testimonial"
                  className="object-cover"
                />
                <AvatarFallback className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-br from-gray-800 to-gray-900 text-[#FF7A00]">
                  RP
                </AvatarFallback>
              </Avatar>
              {/* Decorative glow effect */}
              <div className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 w-8 h-8 sm:w-12 sm:h-12 lg:w-16 lg:h-16 bg-gradient-to-br from-[#FF7A00]/30 to-[#FF7A00]/10 rounded-full blur-sm"></div>
            </div>
          </div>

          {/* Right Column - Testimonial Content */}
          <div className="text-center lg:text-left order-2 lg:order-2 lg:pl-8">
            {/* Large opening quotation mark */}
            <div className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl text-[#FF7A00] font-serif leading-none mb-3 sm:mb-4">
              "
            </div>
            
            {/* Testimonial Quote */}
            <blockquote className="text-base sm:text-lg lg:text-xl xl:text-2xl text-gray-300 italic leading-relaxed mb-4 sm:mb-6 relative -mt-4 sm:-mt-6 lg:-mt-8">
              Can't believe how deep the roleplaying gets on this platform. My custom character's story arc is better than most AAA games.
              
              {/* Closing quotation mark */}
              <span className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl text-[#FF7A00] font-serif absolute -bottom-1 sm:-bottom-2 ml-2">
                "
              </span>
            </blockquote>

            {/* Attribution */}
            <div className="mt-6 sm:mt-8">
              <p className="text-base sm:text-lg font-bold text-[#FF7A00]">
                @RPMaster2024
              </p>
            </div>
          </div>
        </div>

        {/* Trust Badges Section */}
        <div className="text-center">
          <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-12 lg:gap-16">
            {/* SSL Encryption Badge */}
            <div className="flex flex-col items-center group">
              <div className="w-12 h-12 sm:w-14 sm:h-14 mb-2 flex items-center justify-center">
                <Shield className="w-8 h-8 sm:w-10 sm:h-10 text-gray-300 group-hover:text-white transition-colors" />
              </div>
              <p className="text-xs sm:text-sm text-gray-400 font-medium">AES-256 Encryption</p>
            </div>

            {/* Private & Secure Badge */}
            <div className="flex flex-col items-center group">
              <div className="w-12 h-12 sm:w-14 sm:h-14 mb-2 flex items-center justify-center">
                <Lock className="w-8 h-8 sm:w-10 sm:h-10 text-gray-300 group-hover:text-white transition-colors" />
              </div>
              <p className="text-xs sm:text-sm text-gray-400 font-medium">Private & Secure</p>
            </div>

            {/* No Data Training Badge */}
            <div className="flex flex-col items-center group">
              <div className="w-12 h-12 sm:w-14 sm:h-14 mb-2 flex items-center justify-center">
                <Database className="w-8 h-8 sm:w-10 sm:h-10 text-gray-300 group-hover:text-white transition-colors" />
              </div>
              <p className="text-xs sm:text-sm text-gray-400 font-medium">No Data Training</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CustomerTestimonial;
