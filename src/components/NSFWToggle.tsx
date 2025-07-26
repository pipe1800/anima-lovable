import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useNSFW } from '@/contexts/NSFWContext';
import { AlertTriangle } from 'lucide-react';

export function NSFWToggle() {
  const { nsfwEnabled, isAgeVerified, toggleNSFW, verifyAge, isLoading } = useNSFW();
  const [showAgeDialog, setShowAgeDialog] = useState(false);

  const handleToggle = async () => {
    if (!nsfwEnabled && !isAgeVerified) {
      setShowAgeDialog(true);
    } else {
      await toggleNSFW();
    }
  };

  const handleAgeVerification = async (confirmed: boolean) => {
    if (confirmed) {
      const verified = await verifyAge();
      if (verified) {
        await toggleNSFW();
      }
    }
    setShowAgeDialog(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2 opacity-50">
        <Switch disabled />
        <Label className="text-sm">NSFW</Label>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center space-x-2">
        <Switch
          checked={nsfwEnabled}
          onCheckedChange={handleToggle}
          id="nsfw-toggle"
        />
        <Label htmlFor="nsfw-toggle" className="text-sm cursor-pointer">
          NSFW
        </Label>
      </div>

      <Dialog open={showAgeDialog} onOpenChange={setShowAgeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Age Verification Required
            </DialogTitle>
            <DialogDescription className="text-left space-y-2">
              <p>
                To access NSFW (Not Safe For Work) content, you must confirm that you are 18 years of age or older.
              </p>
              <p className="text-sm text-muted-foreground">
                By confirming, you agree that:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>You are at least 18 years old</li>
                <li>You understand that NSFW content may contain mature themes</li>
                <li>You are accessing this content voluntarily</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => handleAgeVerification(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleAgeVerification(true)}
              className="w-full sm:w-auto"
            >
              I am 18 or older
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
