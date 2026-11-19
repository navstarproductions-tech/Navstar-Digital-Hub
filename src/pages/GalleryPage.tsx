import { Gallery } from '@/components/home/Gallery';

export function GalleryPage() {
  return <main className="min-h-screen bg-slate-50 py-8 sm:py-12"><div className="container mx-auto px-4 sm:px-6 lg:px-8"><div className="mb-6 rounded-2xl bg-gradient-to-r from-blue-950 via-blue-900 to-slate-900 p-6 text-white sm:p-8"><p className="text-xs font-bold uppercase tracking-[.2em] text-amber-300">NAVSTAR DIGITAL HUB</p><h1 className="mt-2 text-3xl font-black">Photo Gallery</h1><p className="mt-2 max-w-2xl text-sm text-blue-100">A dedicated collection of approved photographs from the hub. Personal profile photographs are kept out of this public gallery.</p></div><Gallery /></div></main>;
}
