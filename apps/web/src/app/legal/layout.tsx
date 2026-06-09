export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <article
      className={[
        'mx-auto max-w-3xl',
        '[&_h1]:text-headline-lg [&_h1]:mb-4 [&_h1]:font-bold',
        '[&_h2]:text-title-lg [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:font-semibold',
        '[&_h3]:text-title-md [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold',
        '[&_p]:my-3 [&_p]:leading-relaxed',
        '[&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6',
        '[&_a]:text-primary [&_a]:underline hover:[&_a]:opacity-80',
      ].join(' ')}
    >
      {children}
    </article>
  );
}
