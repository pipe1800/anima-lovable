import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PublicTopBar } from '@/components/ui/PublicTopBar';
import { ArrowLeft } from 'lucide-react';

const TermsOfUse = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#121212]">
      {/* Use the standardized PublicTopBar */}
      <PublicTopBar />

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

        {/* Terms of Use Content */}
        <div className="bg-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-8 space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Terms of Use for Anima Chat</h1>
            <p className="text-gray-400">Effective Date: August 5, 2025</p>
          </div>

          <section className="space-y-4">
            <p className="text-gray-300 leading-relaxed">
              Welcome to Anima Chat! These Terms of Use ("Terms") govern your access to and use of our website and character AI chat services (collectively, the "Service"). By accessing or using our Service, you agree to be bound by these Terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">1. User Accounts</h2>
            <p className="text-gray-300 leading-relaxed">
              You are responsible for safeguarding your account information, including your password, and for any activities or actions under your account. You agree to notify us immediately of any unauthorized use of your account. We are not liable for any loss or damage arising from your failure to comply with this security obligation.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">2. User-Generated Content</h2>
            <p className="text-gray-300 leading-relaxed">
              You own the content you create while using the Service, including your inputs and the conversations generated ("User Content").
            </p>
            <p className="text-gray-300 leading-relaxed">
              However, to operate and provide the Service, you grant Anima Chat a worldwide, non-exclusive, royalty-free license to use, host, store, reproduce, modify, and display your User Content solely for the purposes of operating, improving, and providing the Service to you.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">3. Prohibited Activities</h2>
            <p className="text-gray-300 leading-relaxed">
              You agree not to use the Service to engage in any of the following prohibited activities:
            </p>
            
            <div className="ml-4 space-y-3">
              <p className="text-gray-300 leading-relaxed">
                <strong>Illegal Acts:</strong> Promoting or engaging in any activity that is illegal under local or international law.
              </p>
              
              <p className="text-gray-300 leading-relaxed">
                <strong>Harmful Content:</strong> Creating or disseminating content that is harassing, hateful, threatening, or obscene.
              </p>
              
              <p className="text-gray-300 leading-relaxed">
                <strong>System Abuse:</strong> Attempting to "jailbreak," reverse-engineer, or manipulate the AI to bypass its safety filters or intended limitations.
              </p>
              
              <p className="text-gray-300 leading-relaxed">
                <strong>Commercial Use:</strong> Using the Service for any commercial purpose, such as advertising or selling goods, without our express written permission.
              </p>
              
              <p className="text-gray-300 leading-relaxed">
                <strong>Data Scraping:</strong> Using any automated system, such as "bots" or "spiders," to access or scrape data from the Service.
              </p>
            </div>
            
            <p className="text-gray-300 leading-relaxed">
              Engaging in these activities may result in the immediate termination of your account.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">4. Termination</h2>
            <p className="text-gray-300 leading-relaxed">
              We reserve the right to suspend or terminate your access to the Service at any time, without prior notice or liability, for any reason whatsoever, including if you breach these Terms. We may do so at our sole discretion.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">5. Disclaimers</h2>
            <p className="text-gray-300 leading-relaxed font-medium">
              This section is very important, please read it carefully.
            </p>
            
            <div className="ml-4 space-y-3">
              <p className="text-gray-300 leading-relaxed">
                <strong>"As-Is" Service:</strong> The Service is provided on an "AS IS" and "AS AVAILABLE" basis. We make no warranties, express or implied, that the Service will be uninterrupted, secure, or free of errors.
              </p>
              
              <p className="text-gray-300 leading-relaxed">
                <strong>AI Content Disclaimer:</strong> The responses generated by the AI are for entertainment purposes only. They are not factual statements and may contain inaccuracies or nonsensical information. You should not rely on the AI for any professional, medical, legal, financial, or technical advice. Anima Chat is not responsible for any actions you take based on conversations with the AI.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">6. Limitation of Liability</h2>
            <p className="text-gray-300 leading-relaxed">
              To the maximum extent permitted by applicable law, in no event shall Anima Chat, its directors, or its employees be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your use of the Service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">7. Governing Law</h2>
            <p className="text-gray-300 leading-relaxed">
              These Terms shall be governed and construed in accordance with the laws of El Salvador, without regard to its conflict of law provisions.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">8. Changes to Terms</h2>
            <p className="text-gray-300 leading-relaxed">
              We reserve the right to modify these Terms at any time. We will provide notice of any changes by posting the new Terms on this site and updating the "Effective Date." Your continued use of the Service after any such changes constitutes your acceptance of the new Terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">9. Contact Us</h2>
            <p className="text-gray-300 leading-relaxed">
              If you have any questions about these Terms, please contact us at:{' '}
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

export default TermsOfUse;
