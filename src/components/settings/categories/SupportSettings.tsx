
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle, Mail, FileText, ExternalLink } from 'lucide-react';

export const SupportSettings = () => {
  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Support & Help</h2>
        <p className="text-gray-300">Get help and find resources</p>
      </div>

      <div className="space-y-6">
        {/* Contact Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white flex items-center">
                <MessageCircle className="w-5 h-5 mr-2 text-[#FF7A00]" />
                Live Chat
              </CardTitle>
              <CardDescription className="text-gray-400">
                Get instant help from our support team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white">
                Start Chat
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white flex items-center">
                <Mail className="w-5 h-5 mr-2 text-[#FF7A00]" />
                Email Support
              </CardTitle>
              <CardDescription className="text-gray-400">
                Send us a detailed message
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full border-gray-600 text-white hover:bg-gray-800">
                Send Email
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Resources */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Resources</h3>
          <div className="space-y-3">
            <Button variant="ghost" className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800/50">
              <FileText className="w-4 h-4 mr-3" />
              Knowledge Base
              <ExternalLink className="w-4 h-4 ml-auto" />
            </Button>
            <Button variant="ghost" className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800/50">
              <FileText className="w-4 h-4 mr-3" />
              User Guide
              <ExternalLink className="w-4 h-4 ml-auto" />
            </Button>
            <Button variant="ghost" className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800/50">
              <MessageCircle className="w-4 h-4 mr-3" />
              Community Forum
              <ExternalLink className="w-4 h-4 ml-auto" />
            </Button>
          </div>
        </div>

        {/* System Info */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">System Information</h3>
          <div className="bg-gray-800/50 rounded-lg p-4 text-sm">
            <div className="grid grid-cols-2 gap-2 text-gray-300">
              <span>Version:</span>
              <span className="text-white">2.4.1</span>
              <span>Browser:</span>
              <span className="text-white">Chrome 120.0</span>
              <span>Last Updated:</span>
              <span className="text-white">Dec 15, 2023</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
