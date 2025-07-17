import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface OnboardingProgressBarProps {
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  canGoNext: boolean;
}

const OnboardingProgressBar = ({ 
  currentStep, 
  totalSteps, 
  onNext, 
  onBack, 
  canGoNext 
}: OnboardingProgressBarProps) => {
  return (
    <div className="w-full bg-[#121212] border-b border-gray-800 p-2 sm:p-4">
      <div className="max-w-6xl mx-auto px-2 sm:px-4">
        {/* Mobile Layout */}
        <div className="md:hidden">
          <div className="flex justify-between items-center mb-4">
            <Button
              onClick={onBack}
              disabled={currentStep === 0}
              variant="outline"
              size="sm"
              className="flex items-center gap-1 bg-gray-800 border-gray-600 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden xs:inline">Back</span>
            </Button>
            
            <div className="text-center">
              <span className="text-sm text-gray-400">Step {currentStep + 1} of {totalSteps}</span>
            </div>
            
            {currentStep < totalSteps - 1 && (
              <Button
                onClick={onNext}
                disabled={!canGoNext}
                size="sm"
                className="flex items-center gap-1 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="hidden xs:inline">Next</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
            
            {currentStep === totalSteps - 1 && (
              <div className="w-[60px]" />
            )}
          </div>
          
          {/* Mobile Progress Bar */}
          <div className="relative w-full">
            <div className="flex items-center justify-between relative">
              {/* Background line */}
              <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-700 -translate-y-1/2 rounded-full"></div>
              
              {/* Progress line with fluid animation */}
              <div 
                className="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-[#FF7A00] to-[#FF9500] -translate-y-1/2 rounded-full transition-all duration-700 ease-out"
                style={{ 
                  width: `${(currentStep / (totalSteps - 1)) * 100}%`,
                  boxShadow: '0 0 10px rgba(255, 122, 0, 0.5)'
                }}
              ></div>

              {/* Step circles */}
              {Array.from({ length: totalSteps }, (_, index) => (
                <div
                  key={index}
                  className={`relative z-10 w-5 h-5 rounded-full border-2 transition-all duration-500 ease-out ${
                    index <= currentStep
                      ? 'bg-gradient-to-r from-[#FF7A00] to-[#FF9500] border-[#FF7A00] shadow-lg shadow-[#FF7A00]/50' 
                      : 'bg-[#121212] border-gray-600'
                  } ${
                    index === currentStep ? 'animate-pulse scale-110' : ''
                  }`}
                >
                  {/* Inner glow for current step */}
                  {index === currentStep && (
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#FF7A00] to-[#FF9500] animate-ping opacity-75"></div>
                  )}
                  
                  {/* Step number */}
                  <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${
                    index <= currentStep ? 'text-white' : 'text-gray-400'
                  }`}>
                    {index + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden md:flex justify-between items-center gap-4 lg:gap-8">
          {/* Back Button */}
          <Button
            onClick={onBack}
            disabled={currentStep === 0}
            variant="outline"
            className="flex items-center gap-2 bg-gray-800 border-gray-600 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          {/* Progress Bar */}
          <div className="relative w-full max-w-md mx-auto">
            <div className="flex items-center justify-between relative">
              {/* Background line */}
              <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-700 -translate-y-1/2 rounded-full"></div>
              
              {/* Progress line with fluid animation */}
              <div 
                className="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-[#FF7A00] to-[#FF9500] -translate-y-1/2 rounded-full transition-all duration-700 ease-out"
                style={{ 
                  width: `${(currentStep / (totalSteps - 1)) * 100}%`,
                  boxShadow: '0 0 10px rgba(255, 122, 0, 0.5)'
                }}
              ></div>

              {/* Step circles */}
              {Array.from({ length: totalSteps }, (_, index) => (
                <div
                  key={index}
                  className={`relative z-10 w-6 h-6 rounded-full border-2 transition-all duration-500 ease-out ${
                    index <= currentStep
                      ? 'bg-gradient-to-r from-[#FF7A00] to-[#FF9500] border-[#FF7A00] shadow-lg shadow-[#FF7A00]/50' 
                      : 'bg-[#121212] border-gray-600'
                  } ${
                    index === currentStep ? 'animate-pulse scale-110' : ''
                  }`}
                >
                  {/* Inner glow for current step */}
                  {index === currentStep && (
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#FF7A00] to-[#FF9500] animate-ping opacity-75"></div>
                  )}
                  
                  {/* Step number */}
                  <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${
                    index <= currentStep ? 'text-white' : 'text-gray-400'
                  }`}>
                    {index + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Next Button - Hide on final step */}
          {currentStep < totalSteps - 1 && (
            <Button
              onClick={onNext}
              disabled={!canGoNext}
              className="flex items-center gap-2 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:shadow-[#FF7A00]/25 transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              Next Step
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
          
          {/* Spacer for final step to maintain layout */}
          {currentStep === totalSteps - 1 && (
            <div className="flex-shrink-0 w-[120px]" />
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingProgressBar;