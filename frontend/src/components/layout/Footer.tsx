// src/components/layout/Footer.tsx
import React from 'react';

const Footer: React.FC = () => (
  <footer className="border-t py-4 bg-muted/20 text-center">
    <p className="text-xs text-muted-foreground">
      © {new Date().getFullYear()} Gen.AI Labs Staff Full Stack Engineer (AI-Focused) Coding Challenge • Built by Emman Ermitaño
    </p>
  </footer>
);

export default Footer;
