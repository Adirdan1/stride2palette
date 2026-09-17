import { Archivo, Fraunces } from 'next/font/google';
import './globals.css';

/**
 * Weights are named rather than left variable. Naming them ships small static
 * instances instead of every axis, which on a page this sparse is the largest
 * single asset decision there is.
 */
const fraunces = Fraunces({
  weight: ['700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
});

const archivo = Archivo({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-archivo',
});

export const metadata = {
  title: 'Palette',
  description: 'Everything that has to happen before the doors open.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Palette' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Make the on-screen keyboard shrink the viewport rather than sit on top of
  // it, so a bottom sheet and the field being typed into stay visible. Without
  // this, `100dvh` keeps counting the area the keyboard is covering.
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f4ee' },
    { media: '(prefers-color-scheme: dark)', color: '#131210' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${archivo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
