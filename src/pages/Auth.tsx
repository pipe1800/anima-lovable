import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { Eye, EyeOff, Check, X } from 'lucide-react';
const Auth = () => {
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(searchParams.get('mode') !== 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successUsername, setSuccessUsername] = useState('');
  const navigate = useNavigate();

  // Password validation state
  const [passwordValidation, setPasswordValidation] = useState({
    length: false,
    number: false,
    special: false,
    touched: false
  });
  useEffect(() => {
    // Load saved email if remember me was previously checked
    const savedEmail = localStorage.getItem('supabase.auth.remember.email');
    const rememberFlag = localStorage.getItem('supabase.auth.remember');
    if (savedEmail && rememberFlag === 'true') {
      setEmail(savedEmail);
      setRememberMe(true);
    }

    // Check if user is already logged in
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state change:', event, session?.user?.email);
      setUser(session?.user ?? null);
      if (session?.user && !showSuccess) {
        // Check if user has completed onboarding
        const isOnboardingCompleted = session.user.user_metadata?.onboarding_completed;
        if (isOnboardingCompleted) {
          // User already completed onboarding, go to dashboard
          navigate('/dashboard');
        } else {
          // New user or incomplete onboarding, go to onboarding
          navigate('/onboarding');
        }
      }
    });

    // Check for existing session
    supabase.auth.getSession().then(({
      data: {
        session
      }
    }) => {
      setUser(session?.user ?? null);
      if (session?.user && !showSuccess) {
        const isOnboardingCompleted = session.user.user_metadata?.onboarding_completed;
        if (isOnboardingCompleted) {
          navigate('/dashboard');
        } else {
          navigate('/onboarding');
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate, showSuccess]);

  // Real-time password validation
  useEffect(() => {
    if (password || passwordValidation.touched) {
      setPasswordValidation({
        length: password.length >= 8,
        number: /\d/.test(password),
        special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
        touched: true
      });
    }
  }, [password, passwordValidation.touched]);
  const handleSocialAuth = async (provider: 'google' | 'discord') => {
    const {
      error
    } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/`
      }
    });
    if (error) {
      setError(error.message);
    }
  };
  const showSuccessMessage = (username: string) => {
    setSuccessUsername(username);
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      navigate('/onboarding');
    }, 3000);
  };
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (!username.trim()) {
      setError('Username is required');
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }
    const {
      data,
      error
    } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.trim(),
          onboarding_completed: false // Explicitly set to false for new users
        },
        emailRedirectTo: `${window.location.origin}/onboarding`
      }
    });
    if (error) {
      console.log('Signup error:', error.message);
      setError(`Signup failed: ${error.message}. Try using the login form instead if you added a user manually in Supabase.`);
    } else if (data.user && !data.user.email_confirmed_at) {
      // User needs to confirm email, redirect to confirmation page
      navigate('/email-confirmation');
    } else if (data.user) {
      // Email already confirmed (shouldn't happen with new signups, but just in case)
      showSuccessMessage(username.trim());
    }
    setLoading(false);
  };
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const {
      error
    } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) {
      console.log('Login error:', error.message);
      setError(`Login failed: ${error.message}`);
    } else {
      // Handle remember me functionality
      if (rememberMe) {
        localStorage.setItem('supabase.auth.remember', 'true');
        localStorage.setItem('supabase.auth.remember.email', email);
      } else {
        localStorage.removeItem('supabase.auth.remember');
        localStorage.removeItem('supabase.auth.remember.email');
      }
    }
    setLoading(false);
  };
  if (showSuccess) {
    return <div className="min-h-screen bg-[#121212] flex items-center justify-center relative overflow-hidden">
        <div className="text-center z-10">
          <div className="mb-8">
            <div className="w-32 h-32 mx-auto mb-6 relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#FF7A00] to-[#FF7A00]/70 animate-spin"></div>
              <div className="absolute inset-2 rounded-full bg-[#121212] flex items-center justify-center">
                <Check className="w-12 h-12 text-[#FF7A00]" />
              </div>
            </div>
          </div>
          
          <h1 className="text-4xl font-bold text-white mb-2 animate-pulse">
            Welcome, {successUsername}!
          </h1>
          <p className="text-gray-400 text-lg">
            Account created successfully
          </p>
          
          <div className="mt-8 w-64 mx-auto">
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#FF7A00] to-[#FF7A00]/70 rounded-full animate-pulse loading-bar"></div>
            </div>
          </div>
        </div>
        
        {/* Glitch effect background */}
        <div className="absolute inset-0 opacity-20">
          {Array.from({
          length: 10
        }).map((_, i) => <div key={i} className="absolute bg-[#FF7A00] opacity-30" style={{
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          width: `${Math.random() * 200 + 50}px`,
          height: '2px',
          animation: `glitch ${0.5 + Math.random() * 1}s infinite`,
          animationDelay: `${Math.random() * 2}s`
        }} />)}
        </div>
        
        <style>{`
          @keyframes glitch {
            0%, 100% { transform: translateX(0) scaleX(1); opacity: 0.3; }
            25% { transform: translateX(-10px) scaleX(1.2); opacity: 0.8; }
            50% { transform: translateX(10px) scaleX(0.8); opacity: 0.4; }
            75% { transform: translateX(-5px) scaleX(1.1); opacity: 0.9; }
          }
          
          .loading-bar {
            animation: loading 3s ease-out forwards;
          }
          
          @keyframes loading {
            0% { width: 0%; }
            100% { width: 100%; }
          }
        `}</style>
      </div>;
  }
  return <div className="min-h-screen bg-[#121212] relative overflow-hidden flex items-center justify-center">
      {/* Back Button */}
      <div className="absolute top-6 left-6 z-20">
        <Link to="/" className="flex items-center text-white hover:text-[#FF7A00] transition-colors">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
      </div>
      
      {/* Logo */}
      <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-20">
        <img src="https://rclpyipeytqbamiwcuih.supabase.co/storage/v1/object/sign/images/45d0ba23-cfa2-404a-8527-54e83cb321ef.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9mYmU5OTM4My0yODYxLTQ0N2UtYThmOC1hY2JjNzU3YjQ0YzgiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJpbWFnZXMvNDVkMGJhMjMtY2ZhMi00MDRhLTg1MjctNTRlODNjYjMyMWVmLnBuZyIsImlhdCI6MTc1MjI1MjA4MywiZXhwIjo0OTA1ODUyMDgzfQ.OKhncau8pVPBvcnDrafnifJdihe285oi5jcpp1z3-iM" alt="Anima AI Chat" className="h-16 w-auto" />
      </div>

      {/* Futuristic Background Animation */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0 bg-gradient-to-br from-[#FF7A00]/10 via-transparent to-[#1a1a2e]/30"></div>
        <div className="neural-network">
          {/* Neural network nodes */}
          {Array.from({
          length: 20
        }).map((_, i) => <div key={i} className="neural-node" style={{
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 4}s`,
          animationDuration: `${4 + Math.random() * 2}s`
        }} />)}
          {/* Connection lines */}
          <svg className="absolute inset-0 w-full h-full">
            {Array.from({
            length: 15
          }).map((_, i) => <line key={i} x1={`${Math.random() * 100}%`} y1={`${Math.random() * 100}%`} x2={`${Math.random() * 100}%`} y2={`${Math.random() * 100}%`} stroke="rgba(255, 122, 0, 0.1)" strokeWidth="1" className="animate-pulse" style={{
            animationDelay: `${Math.random() * 3}s`,
            animationDuration: `${3 + Math.random() * 2}s`
          }} />)}
          </svg>
        </div>
      </div>

      {/* Auth Form */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-[#1a1a2e]/80 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8 shadow-2xl my-[100px]">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              {isLogin ? 'Welcome Back' : 'Create Your Account'}
            </h1>
            <p className="text-gray-400">
              {isLogin ? 'Sign in to continue your journey' : 'Join thousands creating their perfect AI companions'}
            </p>
          </div>

          {/* Social Auth Buttons */}
          <div className="space-y-3 mb-6">
            <Button type="button" onClick={() => handleSocialAuth('discord')} className="w-full bg-[#5865F2] hover:bg-[#5865F2]/90 text-white font-medium py-3 rounded-lg transition-all duration-300 flex items-center justify-center gap-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0189 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1568 2.4189Z" />
              </svg>
              Continue with Discord
            </Button>
            <Button type="button" onClick={() => handleSocialAuth('google')} className="w-full bg-white hover:bg-gray-100 text-gray-900 font-medium py-3 rounded-lg transition-all duration-300 flex items-center justify-center gap-3">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </Button>
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-600/50"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-[#1a1a2e] text-gray-400">
                {isLogin ? 'or' : 'Or sign up with email'}
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={isLogin ? handleLogin : handleSignUp} className="space-y-4">
            {!isLogin && <div>
                <Input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20" required={!isLogin} />
              </div>}
            
            <div>
              <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20" required />
            </div>
            
            <div>
              <div className="relative">
                <Input type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onFocus={() => !isLogin && setPasswordValidation(prev => ({
                ...prev,
                touched: true
              }))} className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20 pr-10" required minLength={6} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              
              {/* Password Requirements (Sign-up only) */}
              {!isLogin && passwordValidation.touched && <div className="mt-2 space-y-1">
                  <div className={`text-sm flex items-center ${passwordValidation.length ? 'text-green-400' : 'text-gray-400'}`}>
                    {passwordValidation.length ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                    8+ characters
                  </div>
                  <div className={`text-sm flex items-center ${passwordValidation.number ? 'text-green-400' : 'text-gray-400'}`}>
                    {passwordValidation.number ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                    1 number
                  </div>
                  <div className={`text-sm flex items-center ${passwordValidation.special ? 'text-green-400' : 'text-gray-400'}`}>
                    {passwordValidation.special ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                    1 special character
                  </div>
                </div>}
            </div>

            {/* Confirm Password field (Sign-up only) */}
            {!isLogin && <div>
                <div className="relative">
                  <Input type={showConfirmPassword ? "text" : "password"} placeholder="Confirm Password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20 pr-10" required={!isLogin} />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300">
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                
                {/* Password match indicator */}
                {confirmPassword && <div className={`mt-2 text-sm flex items-center ${password === confirmPassword ? 'text-green-400' : 'text-red-400'}`}>
                    {password === confirmPassword ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                    {password === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                  </div>}
              </div>}

            {/* Login-specific elements */}
            {isLogin && <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox id="remember" checked={rememberMe} onCheckedChange={checked => setRememberMe(checked as boolean)} />
                  <label htmlFor="remember" className="text-sm text-gray-300">
                    Remember Me
                  </label>
                </div>
                <button type="button" onClick={() => navigate('/forgot-password')} className="text-sm text-[#FF7A00] hover:text-[#FF7A00]/80 transition-colors">
                  Forgot Password?
                </button>
              </div>}

            {error && <div className="text-red-400 bg-red-900/20 text-sm text-center p-3 rounded-lg">
                {error}
              </div>}

            <Button type="submit" disabled={loading} className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white font-bold py-3 text-lg rounded-lg shadow-lg hover:shadow-[#FF7A00]/25 transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create My Account'}
            </Button>
          </form>

          {/* Toggle */}
          <div className="text-center mt-6">
            <button type="button" onClick={() => {
            setIsLogin(!isLogin);
            setError('');
            setUsername('');
            setEmail('');
            setPassword('');
            setConfirmPassword('');
            setPasswordValidation({
              length: false,
              number: false,
              special: false,
              touched: false
            });
          }} className="text-gray-400 hover:text-[#FF7A00] transition-colors underline-offset-4 hover:underline">
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
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
    </div>;
};
export default Auth;