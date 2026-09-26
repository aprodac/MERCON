import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';

interface SlowScrollingDriverNameProps {
  name: string;
  className?: string;
}

export default function SlowScrollingDriverName({ name, className = "" }: SlowScrollingDriverNameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scrollDistance, setScrollDistance] = useState<number>(0);
  const [textWidth, setTextWidth] = useState<number>(0);

  const calculateOverflow = () => {
    if (containerRef.current && textRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const singleTextWidth = textRef.current.scrollWidth;
      const overflow = singleTextWidth - containerWidth;
      if (overflow > 2) {
        setScrollDistance(overflow);
        setTextWidth(singleTextWidth);
      } else {
        setScrollDistance(0);
        setTextWidth(0);
      }
    }
  };

  useLayoutEffect(() => {
    calculateOverflow();
  }, [name]);

  useEffect(() => {
    const handleResize = () => calculateOverflow();
    window.addEventListener('resize', handleResize);
    
    let observer: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => calculateOverflow());
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (observer) observer.disconnect();
    };
  }, [name]);

  const isScrolling = scrollDistance > 0;
  // Dynamic duration for faster, continuous seamless marquee (~45px per second)
  const durationSeconds = Math.max(3.5, Math.round((textWidth || 200) / 45) + 1);

  if (!isScrolling) {
    return (
      <div ref={containerRef} className="overflow-hidden min-w-0 w-full" title={name}>
        <span ref={textRef} className={`block truncate ${className}`}>
          {name}
        </span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className="overflow-hidden min-w-0 w-full relative group"
      title={name}
    >
      <style>{`
        @keyframes continuousMarqueeScroll {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      <div
        style={{
          display: 'inline-flex',
          whiteSpace: 'nowrap',
          animation: `continuousMarqueeScroll ${durationSeconds}s linear infinite`,
        }}
        className="group-hover:[animation-play-state:paused]"
      >
        <span ref={textRef} className={`inline-block whitespace-nowrap pr-6 ${className}`}>
          {name} &nbsp;•&nbsp;
        </span>
        <span className={`inline-block whitespace-nowrap pr-6 ${className}`}>
          {name} &nbsp;•&nbsp;
        </span>
      </div>
    </div>
  );
}
