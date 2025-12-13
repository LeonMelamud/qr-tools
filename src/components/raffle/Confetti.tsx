"use client";

import React, { useRef, useEffect } from 'react';

const PARTICLE_COUNT = 150;
const GRAVITY = 0.05;
const TERMINAL_VELOCITY = 1;

type Particle = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  color: string;
  angle: number;
  dAngle: number;
  opacity: number;
};

const themeColors = ['#FFC629', '#FFFFFF', '#333333']; // Bumble yellow, white, dark gray

export function Confetti({ isCelebrating, image }: { isCelebrating: boolean; image?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | undefined>(undefined);
  const particles = useRef<Particle[]>([]);
  const logoImageRef = useRef<HTMLImageElement | null>(null);
  const imageRef = useRef<string | undefined>(image);

  // Keep image ref updated
  useEffect(() => {
    imageRef.current = image;
    if (image) {
      const img = new Image();
      img.src = image;
      img.onload = () => {
        logoImageRef.current = img;
      };
    } else {
      logoImageRef.current = null;
    }
  }, [image]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onResize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
    };

    const resetParticles = () => {
      particles.current = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.current.push({
          x: canvas.width * 0.5,
          y: canvas.height * 0.7,
          w: imageRef.current ? Math.random() * 40 + 50 : Math.random() * 8 + 5,
          h: imageRef.current ? Math.random() * 40 + 50 : Math.random() * 8 + 5,
          vx: (Math.random() - 0.5) * 25,
          vy: (Math.random() - 0.5) * 25 - 20,
          color: themeColors[Math.floor(Math.random() * themeColors.length)],
          angle: Math.random() * 360,
          dAngle: (Math.random() - 0.5) * 10,
          opacity: 1,
        });
      }
    };

    const animate = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.current.forEach(p => {
        p.vy += GRAVITY;
        if (p.vy > TERMINAL_VELOCITY) {
          p.vy = TERMINAL_VELOCITY;
        }
        p.vx *= 0.98;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.dAngle;
        p.opacity = Math.max(0, p.opacity - 0.0003);
        
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle * Math.PI / 180);
        ctx.globalAlpha = p.opacity;

        if (logoImageRef.current) {
          ctx.drawImage(logoImageRef.current, -p.w / 2, -p.h / 2, p.w, p.h);
        } else {
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        
        ctx.restore();
      });

      particles.current = particles.current.filter(p => p.y < canvas.height && p.opacity > 0);

      if (particles.current.length > 0) {
        animationFrameId.current = requestAnimationFrame(animate);
      }
    };

    onResize();
    window.addEventListener('resize', onResize);
    
    if (isCelebrating) {
      resetParticles();
      if (particles.current.length > 0) {
        animationFrameId.current = requestAnimationFrame(animate);
      }
    } else {
      particles.current = [];
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      // Clear the canvas when stopping
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    
    return () => {
      window.removeEventListener('resize', onResize);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isCelebrating]);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 w-full h-full pointer-events-none z-50"
      aria-hidden="true"
    />
  );
}
