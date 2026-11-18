import { useEffect, useState } from 'react';
import { Mail, Phone, MapPin, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

type DownloadDocument = {
  id: string;
  title: string;
  description: string;
  originalName: string;
  url: string;
};

const exploreLinks = [
  ['Home', '/'],
  ['About Us', '/about'],
  ['Courses', '/courses'],
  ['Services', '/services'],
  ['Gallery', '/gallery'],
  ['Fee Structures', '/fees'],
];



export function Footer() {
  const [downloads, setDownloads] = useState<DownloadDocument[]>([]);

  useEffect(() => {
    fetch('/api/downloads')
      .then(async (response) =>
        response.ok
          ? (response.json() as Promise<{ documents?: DownloadDocument[] }>)
          : null
      )
      .then((result) => {
        if (result?.documents) setDownloads(result.documents);
      })
      .catch(() => undefined);
  }, []);

  return (
    <footer className="relative overflow-hidden border-t-4 border-green-500 bg-blue-950 text-slate-200">
      <div className="h-1 w-full bg-gradient-to-r from-green-500 via-amber-400 to-green-500" />
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_1fr] lg:gap-10">
          <div>
            <Link to="/" className="inline-flex items-center gap-3 text-white">
              <img src="/Navstar_Official_Logo.jpg" alt="Navstar Digital Hub logo" className="h-16 w-24 rounded-lg object-contain" />
              <span>
                <strong className="block text-base tracking-wide">NAVSTAR DIGITAL HUB</strong>
                <small className="text-xs font-semibold tracking-wider text-amber-300">HOME OF TECHNOCRATS</small>
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
              Digital services, technology training and practical solutions for a connected world.
            </p>
            <address className="mt-5 space-y-3 text-sm not-italic text-slate-300">
              <p className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                P.O. Box 546-50200, Bungoma, Kenya
              </p>
              <a className="flex items-center gap-3 transition hover:text-white" href="tel:+254797688576">
                <Phone className="h-4 w-4 shrink-0 text-green-400" />
                +254 797 688 576
              </a>
              <a className="flex items-center gap-3 break-all transition hover:text-white" href="mailto:navstardigitalhub@gmail.com">
                <Mail className="h-4 w-4 shrink-0 text-green-400" />
                navstardigitalhub@gmail.com
              </a>
            </address>
          </div>

          <nav aria-label="Explore">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Explore</h3>
            <ul className="mt-4 space-y-3 text-sm">
              {exploreLinks.map(([label, path]) => (
                <li key={label}>
                  <Link className="transition hover:text-amber-300" to={path} onClick={() => window.scrollTo(0, 0)}>{label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          {downloads.length > 0 && (
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">Downloads</h3>
              <ul className="mt-4 space-y-3 text-sm">
                {downloads.map((document) => (
                  <li key={document.id} className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                    <a href={document.url} className="transition hover:text-amber-200" download>
                      {document.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-9 flex flex-col gap-2 border-t border-green-500/50 pt-5 text-xs text-slate-300 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Navstar Digital Hub. All rights reserved.</p>
          <p>Designed &amp; powered by Navstar Systems.</p>
        </div>
      </div>
    </footer>
  );
}
