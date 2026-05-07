'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

export default function AgeGate() {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const isVerified = localStorage.getItem('alyra_age_verified');
    if (isVerified) {
      router.push('/login');
    } else {
      setIsVisible(true);
    }
  }, [router]);

  const handleVerify = () => {
    localStorage.setItem('alyra_age_verified', 'true');
    document.cookie = 'alyra_age_verified=true; path=/; max-age=31536000; SameSite=Strict';
    // Use hard navigation to ensure the cookie is sent with the next request
    window.location.href = '/login';
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black text-white p-6"
        >
          <div className="max-w-md text-center space-y-6">
            <h1 className="text-3xl font-serif">Alyra X</h1>

            {/* Mandatory 2026 AI Disclosure */}
            <div className="bg-gray-900 p-4 rounded-lg border border-gray-800 text-sm">
              <p className="text-gray-400 mb-2">LEGAL DISCLOSURE (SB 243):</p>
              <p>
                You are about to interact with an{' '}
                <span className="text-yellow-500 font-bold">AI Companion</span>, not a human.
                This service is for entertainment and simulation purposes only.
              </p>
            </div>

            <p className="text-lg">You must be at least 18 years of age to enter this site.</p>

            <button
              onClick={handleVerify}
              className="w-full py-4 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition"
            >
              I AM 18+ (ENTER)
            </button>

            <div className="text-xs text-gray-500 space-y-2">
              <p>By entering, you agree to our Terms of Service.</p>
              <a
                href="https://988lifeline.org"
                className="underline block"
                target="_blank"
                rel="noopener noreferrer"
              >
                National Suicide Prevention Lifeline (988)
              </a>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
