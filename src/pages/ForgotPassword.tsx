import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setEmailSent(true);
    }
    setLoading(false);
  };

  if (emailSent) {
    return (
      <div className="min-h-screen bg-[#121212] relative overflow-hidden flex items-center justify-center">
        {/* Logo */}
        <div className="absolute top-6 left-6 z-20">
          <Link to="/" className="cursor-pointer">
            <img 
              src="/assets/logo.png" 
              alt="Anima AI Chat" 
              className="h-16 w-auto hover:opacity-80 transition-opacity"
            />
          </Link>
        </div>

        {/* Background Effects */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0 bg-gradient-to-br from-[#FF7A00]/10 via-transparent to-[#1a1a2e]/30"></div>
          <div className="neural-network">
            {Array.from({ length: 15 }).map((_, i) => (
              <div
                key={i}
                className="neural-node"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 4}s`,
                  animationDuration: `${4 + Math.random() * 2}s`
                }}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 w-full max-w-6xl mx-4">
          <div className="bg-[#1a1a2e]/80 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8 shadow-2xl">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              {/* Left Column - Character Image */}
              <div className="relative flex justify-center">
                <div className="relative w-full max-w-lg">
                  {/* Glowing backdrop effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-[#FF7A00]/20 via-purple-500/10 to-blue-500/20 rounded-2xl blur-3xl scale-110"></div>
                  
                  {/* Character Image */}
                  <div className="relative bg-gradient-to-br from-[#1a1a2e] to-[#121212] rounded-2xl border border-[#FF7A00]/20 overflow-hidden shadow-2xl">
                    <img
                      src="/lovable-uploads/da9041fd-b61d-48b0-b0c3-f1d319746d61.png"
                      alt="Reset Password Character"
                      className="w-full h-auto"
                    />
                    
                    {/* Subtle overlay for theme integration */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#121212]/10 via-transparent to-[#FF7A00]/5 pointer-events-none"></div>
                  </div>

                  {/* Floating elements */}
                  <div className="absolute -top-4 -left-4 w-8 h-8 bg-[#FF7A00]/20 rounded-full animate-pulse"></div>
                  <div className="absolute -bottom-6 -right-6 w-6 h-6 bg-purple-500/20 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
                </div>
              </div>

              {/* Right Column - Content */}
              <div className="text-center md:text-left">
                <div className="flex items-center gap-3 mb-4">
                  <Mail className="w-8 h-8 text-[#FF7A00]" />
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight text-white">
                    Check Your Email!
                  </h1>
                </div>
                
                <p className="text-lg sm:text-xl text-gray-300 mb-6 leading-relaxed">
                  We've sent a password reset link to <span className="text-[#FF7A00] font-semibold">{email}</span>. 
                  Click the link in the email to reset your password.
                </p>

                {/* Instructions */}
                <div className="bg-[#121212]/50 border border-gray-600/30 rounded-lg p-4 mb-6">
                  <h3 className="text-[#FF7A00] font-semibold mb-2">What's Next?</h3>
                  <ul className="text-gray-300 text-sm space-y-1 text-left">
                    <li>• Check your inbox (and spam folder just in case)</li>
                    <li>• Click the password reset link in the email</li>
                    <li>• Enter your new password when prompted</li>
                    <li>• Sign in with your new password</li>
                  </ul>
                </div>

                {/* Back Button */}
                <Link to="/auth">
                  <Button 
                    variant="outline"
                    className="bg-transparent border-[#FF7A00] text-[#FF7A00] hover:bg-[#FF7A00] hover:text-white transition-all duration-300 mb-4"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Login
                  </Button>
                </Link>

                {/* Support Text */}
                <p className="text-xs text-gray-400 mt-4">
                  Didn't receive the email? Check your spam folder or try again.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CSS Styles for Neural Network Animation */}
        <style>{`
          .neural-network {
            position: absolute;
            inset: 0;
            overflow: hidden;
          }
          
          .neural-node {
            position: absolute;
            width: 4px;
            height: 4px;
            background: #FF7A00;
            border-radius: 50%;
            animation: float 6s ease-in-out infinite;
            box-shadow: 0 0 10px rgba(255, 122, 0, 0.5);
          }
          
          @keyframes float {
            0%, 100% { transform: translateY(0px) scale(1); opacity: 0.3; }
            50% { transform: translateY(-20px) scale(1.2); opacity: 0.8; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212] relative overflow-hidden flex items-center justify-center">
      {/* Logo */}
      <div className="absolute top-6 left-6 z-20">
        <Link to="/" className="cursor-pointer">
          <img 
            src="/assets/logo.png"
            alt="Anima AI Chat" 
            className="h-16 w-auto hover:opacity-80 transition-opacity"
          />
        </Link>
      </div>

      {/* Background Effects */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0 bg-gradient-to-br from-[#FF7A00]/10 via-transparent to-[#1a1a2e]/30"></div>
        <div className="neural-network">
          {Array.from({ length: 15 }).map((_, i) => (
            <div
              key={i}
              className="neural-node"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 4}s`,
                animationDuration: `${4 + Math.random() * 2}s`
              }}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-6xl mx-4">
        <div className="bg-[#1a1a2e]/80 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8 shadow-2xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left Column - Character Image */}
            <div className="relative flex justify-center">
              <div className="relative w-full max-w-lg">
                {/* Glowing backdrop effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#FF7A00]/20 via-purple-500/10 to-blue-500/20 rounded-2xl blur-3xl scale-110"></div>
                
                {/* Character Image */}
                <div className="relative bg-gradient-to-br from-[#1a1a2e] to-[#121212] rounded-2xl border border-[#FF7A00]/20 overflow-hidden shadow-2xl">
                  <img
                    src="/lovable-uploads/da9041fd-b61d-48b0-b0c3-f1d319746d61.png"
                    alt="Reset Password Character"
                    className="w-full h-auto"
                    loading="eager"
                  />
                  
                  {/* Subtle overlay for theme integration */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#121212]/10 via-transparent to-[#FF7A00]/5 pointer-events-none"></div>
                </div>

                {/* Floating elements */}
                <div className="absolute -top-4 -left-4 w-8 h-8 bg-[#FF7A00]/20 rounded-full animate-pulse"></div>
                <div className="absolute -bottom-6 -right-6 w-6 h-6 bg-purple-500/20 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
              </div>
            </div>

            {/* Right Column - Form */}
            <div className="text-center md:text-left">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 leading-tight text-white">
                Forgot Password?
              </h1>
              
              <p className="text-lg sm:text-xl text-gray-300 mb-6 leading-relaxed">
                No worries! Enter your email address and we'll send you a link to reset your password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20"
                    required
                  />
                </div>

                {error && (
                  <div className="text-red-400 bg-red-900/20 text-sm p-3 rounded-lg">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white font-bold py-3 text-lg rounded-lg shadow-lg hover:shadow-[#FF7A00]/25 transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>
              </form>

              {/* Back Button */}
              <div className="mt-6">
                <Link to="/auth">
                  <Button 
                    variant="outline"
                    className="bg-transparent border-[#FF7A00] text-[#FF7A00] hover:bg-[#FF7A00] hover:text-white transition-all duration-300"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Login
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CSS Styles for Neural Network Animation */}
      <style>{`
        .neural-network {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }
        
        .neural-node {
          position: absolute;
          width: 4px;
          height: 4px;
          background: #FF7A00;
          border-radius: 50%;
          animation: float 6s ease-in-out infinite;
          box-shadow: 0 0 10px rgba(255, 122, 0, 0.5);
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); opacity: 0.3; }
          50% { transform: translateY(-20px) scale(1.2); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
};

export default ForgotPassword;