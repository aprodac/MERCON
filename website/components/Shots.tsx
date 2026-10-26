import { asset } from '@/lib/asset';

// Product screenshots in a minimal browser / phone frame. All screenshots are
// taken from the real app running on fictional sample data.

type Shot = { src: string; alt: string; caption?: string };

export function Browser({ src, alt, caption, url = 'app.linaul.com', className = '' }: Shot & { url?: string; className?: string }) {
  return (
    <figure className={`shot ${className}`}>
      <div className="browser">
        <div className="browser-bar">
          <span className="dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="url">{url}</span>
        </div>
        <a href={asset(src)} target="_blank" rel="noreferrer" aria-label={`Open full size: ${alt}`}>
          <img src={asset(src)} alt={alt} loading="lazy" width={1920} height={1080} />
        </a>
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

export function Phone({ src, alt, caption, className = '' }: Shot & { className?: string }) {
  return (
    <figure className={`shot phone-shot ${className}`}>
      <div className="phone-frame">
        <img src={asset(src)} alt={alt} loading="lazy" width={786} height={1704} />
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

export function PhoneRow({ shots }: { shots: Shot[] }) {
  return (
    <div className="phone-row">
      {shots.map((s) => (
        <Phone key={s.src} {...s} />
      ))}
    </div>
  );
}
