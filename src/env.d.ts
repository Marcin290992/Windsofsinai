/// <reference types="astro/client" />

declare module '*.css' {
  const content: string;
  export default content;
}

declare module '*.webm' {
  const src: string;
  export default src;
}

declare module '*.svg?url' {
  const src: string;
  export default src;
}

declare module 'gsap' {
  export const gsap: any;
}

declare module 'gsap/ScrollTrigger' {
  export const ScrollTrigger: any;
}
