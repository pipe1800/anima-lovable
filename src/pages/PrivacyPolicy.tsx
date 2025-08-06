import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#121212]">
      {/* TopBar - Same as landing page */}
      <header className="sticky top-0 z-50 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center cursor-pointer" onClick={() => navigate('/')}>
              <img src="/assets/logo.png" alt="Anima Chat" className="h-8 w-auto" />
            </div>
            <div className="flex items-center space-x-4">
              <Button
                onClick={() => navigate('/auth')}
                variant="ghost"
                className="text-gray-300 hover:text-white"
              >
                Sign In
              </Button>
              <Button
                onClick={() => navigate('/auth?mode=signup')}
                className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Back button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-8 text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>

        {/* Privacy Policy Content */}
        <div className="bg-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-8 space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy for Anima Chat</h1>
            <p className="text-gray-400">Effective Date: August 5, 2025</p>
          </div>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">1. Introduction</h2>
            <p className="text-gray-300 leading-relaxed">
              Welcome to Anima Chat ("we," "us," or "our"). We are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our character AI chat service (the "Service"). Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access the site.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">2. Information We Collect</h2>
            <p className="text-gray-300 leading-relaxed">
              We collect information that you provide to us directly and information that is automatically collected when you use our Service.
            </p>
            
            <div className="ml-4 space-y-3">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">A. Personal Information You Provide:</h3>
                <p className="text-gray-300 leading-relaxed">
                  <strong>Account Information:</strong> When you register for an account, we collect your username and email address. This information is stored securely in our database.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">B. User-Generated Content:</h3>
                <p className="text-gray-300 leading-relaxed">
                  <strong>Chat Data:</strong> We collect the content of the conversations you have with our AI characters to provide you with the Service.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">C. Information Collected Automatically:</h3>
                <p className="text-gray-300 leading-relaxed">
                  <strong>Cookies:</strong> We use cookies for essential functions such as session management (to keep you logged in) and for our own internal analytics to understand how our Service is used and how we can improve it. You are not able to opt-out of essential cookies as the site cannot function without them.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">3. How We Use Your Information</h2>
            <p className="text-gray-300 leading-relaxed">We use the information we collect for the following purposes:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-300 ml-4">
              <li>To create and manage your account.</li>
              <li>To provide, operate, and maintain our Service.</li>
              <li>To deliver a personalized user experience.</li>
              <li>To analyze usage and trends to improve our website and Service offerings.</li>
              <li>To communicate with you, including sending service-related notices.</li>
            </ul>
            <p className="text-gray-300 leading-relaxed">
              We do not use your personal information (like your email) or your private chat logs to train our own AI models. Your conversations are used in real-time to generate responses from our third-party AI provider.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">4. How We Share Your Information</h2>
            <p className="text-gray-300 leading-relaxed">
              We are committed to not sharing your personal data, with the following exceptions:
            </p>
            
            <div className="ml-4 space-y-3">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">A. Third-Party AI Provider:</h3>
                <p className="text-gray-300 leading-relaxed">
                  To provide the AI chat functionality, we send the contents of your chat messages to our external AI model provider. This is necessary to generate the AI's responses. We do not send your username or email address along with this chat data. We use models provided by OpenRouter. You can view their privacy policy at{' '}
                  <a href="https://openrouter.ai/privacy" target="_blank" rel="noopener noreferrer" className="text-[#FF7A00] hover:underline">
                    https://openrouter.ai/privacy
                  </a>
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">B. By Law or to Protect Rights:</h3>
                <p className="text-gray-300 leading-relaxed">
                  We may disclose your information if we are required to do so by law or in the good faith belief that such action is necessary to (i) comply with a legal obligation, (ii) protect and defend our rights or property, (iii) act in urgent circumstances to protect the personal safety of users of the Service or the public, or (iv) protect against legal liability.
                </p>
              </div>
            </div>
            
            <p className="text-gray-300 leading-relaxed">
              We do not sell, rent, or trade your personal information with any other third parties for marketing or advertising purposes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">5. Data Security</h2>
            <p className="text-gray-300 leading-relaxed">
              We use administrative, technical, and physical security measures to help protect your personal information. We use encryption and access controls to safeguard data stored in our databases. While we have taken reasonable steps to secure the personal information you provide to us, please be aware that despite our efforts, no security measures are perfect or impenetrable, and no method of data transmission can be guaranteed against any interception or other type of misuse.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">6. Data Retention</h2>
            <p className="text-gray-300 leading-relaxed">
              We will retain your personal information and chat data for as long as your account is active. If you choose to delete your account, we will delete your personal information and associated data from our systems in a timely manner.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">7. Your Rights and Choices</h2>
            <p className="text-gray-300 leading-relaxed">You have certain rights regarding your personal information.</p>
            
            <div className="ml-4 space-y-3">
              <p className="text-gray-300 leading-relaxed">
                <strong>Access and Deletion:</strong> You may request access to or deletion of your personal data at any time by contacting us. We will respond to your request in accordance with applicable law.
              </p>
              
              <p className="text-gray-300 leading-relaxed">
                <strong>Opting Out:</strong> The collection of your username, email, and chat data is essential for the Service to function. Therefore, you cannot opt-out of this collection and continue to use the Service. The only way to stop this data collection is to cease using the Service and request the deletion of your account.
              </p>
            </div>
            
            <p className="text-gray-300 leading-relaxed">
              To make a request, please contact us at{' '}
              <a href="mailto:admin@animachat.app" className="text-[#FF7A00] hover:underline">
                admin@animachat.app
              </a>
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">8. Children's Privacy</h2>
            <p className="text-gray-300 leading-relaxed">
              Our Service is not directed to individuals under the age of 13, and we do not knowingly collect personal information from children under 13. If we become aware that we have inadvertently received personal information from a user under the age of 13, we will delete the information from our records.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">9. Changes to This Privacy Policy</h2>
            <p className="text-gray-300 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Effective Date" at the top. You are advised to review this Privacy Policy periodically for any changes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">10. Contact Us</h2>
            <p className="text-gray-300 leading-relaxed">
              If you have any questions about this Privacy Policy, please contact us at:{' '}
              <a href="mailto:admin@animachat.app" className="text-[#FF7A00] hover:underline">
                admin@animachat.app
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
