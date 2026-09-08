// Styles for the layout variants ported from the design lab (tools/design-lab),
// September 2026. Appended to the base stylesheet before the presets, so presets
// still decide type weights and button shapes; these rules only decide layout.
export const VARIANTS_CSS = `
/* shared details */
.kicker{display:flex;align-items:center;gap:.75rem;margin:0 0 1.1rem;font-size:.75rem;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.kicker::before{content:"";flex:none;width:2rem;height:1px;background:var(--line)}
.eyebrow.quiet{color:var(--muted);font-weight:500;letter-spacing:.18em}
.arr{flex:none;transition:transform .15s ease}
.btn:hover .arr,.textlink:hover .arr{transform:translateX(3px)}
.btn.invert{background:var(--on-primary);color:var(--primary);border-color:var(--on-primary)}
.btn.invert:hover{background:color-mix(in srgb,var(--on-primary) 90%,var(--primary))}
.textlink{display:inline-flex;align-items:center;gap:.55rem;padding-bottom:.25rem;color:var(--text);font-size:.95rem;font-weight:500;border-bottom:1px solid var(--line);transition:border-color .15s ease}
.textlink:hover{border-color:var(--text)}
/* hero offset */
.hero.offset{overflow:hidden}
.hero.offset .wrap{display:grid;gap:clamp(2.75rem,7vw,5rem);align-items:start}
.hero.offset .copy{min-width:0}
.hero.offset h1{font-size:clamp(2.5rem,1.6rem + 4vw,5.25rem);line-height:1.02;letter-spacing:-.02em;max-width:15ch;margin:0}
.hero.offset .lead{margin:1.6rem 0 0;max-width:42ch}
.hero.offset .actions{align-items:center;gap:1rem 1.9rem;margin-top:2.4rem}
.hero.offset .media{position:relative;min-width:0}
.hero.offset .plate{position:relative}
.hero.offset .plate::before{content:"";position:absolute;inset:-1.25rem -1.25rem 1.25rem 1.25rem;background:color-mix(in srgb,var(--primary) 10%,var(--bg));border-radius:var(--radius)}
.hero.offset .plate img,.hero.offset .plate .art{position:relative;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius)}
.hero.offset .mark{display:flex;align-items:center;gap:1rem;margin-top:1.1rem;font-family:var(--font-heading);font-size:.85rem;letter-spacing:.12em;color:var(--muted)}
.hero.offset .mark::after{content:"";flex:1;height:1px;background:var(--line)}
@media (min-width:880px){.hero.offset .wrap{grid-template-columns:minmax(0,7fr) minmax(0,5fr);align-items:center;gap:clamp(3rem,6vw,6rem)}.hero.offset .media{margin-top:clamp(3rem,7vw,6rem)}.hero.offset .plate img,.hero.offset .plate .art{aspect-ratio:4/5}.hero.offset .plate::before{inset:-1.5rem -1.5rem 1.5rem 1.5rem}}
/* hero poster */
.hero.poster .caption{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:.5rem 1.5rem;padding-bottom:.85rem;border-bottom:1px solid var(--line)}
.hero.poster .caption span{font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;line-height:1.4;color:var(--muted)}
.hero.poster .caption .brand-mark{margin-left:auto;color:var(--text);font-family:var(--font-heading);letter-spacing:.1em}
.hero.poster h1{font-size:clamp(2.6rem,1.2rem + 7.6vw,6.9rem);line-height:.98;letter-spacing:-.025em;margin:clamp(1.75rem,4vw,3.25rem) 0 0;max-width:18ch;overflow-wrap:break-word}
.hero.poster .row{display:flex;flex-direction:column;gap:1.5rem;margin-top:clamp(1.75rem,4vw,3rem)}
.hero.poster .lead{margin:0;max-width:36ch}
.hero.poster .actions{margin:0}
.hero.poster .figure{margin:clamp(2.25rem,6vw,4.5rem) 0 0;position:relative}
.hero.poster .figure img,.hero.poster .figure .art{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius)}
.hero.poster figcaption{margin-top:.75rem;font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:.75rem}
.hero.poster figcaption::before{content:"";width:2rem;height:1px;background:var(--line)}
@media (min-width:720px){.hero.poster .row{flex-direction:row;justify-content:space-between;align-items:flex-end;gap:2.5rem}.hero.poster .actions{flex:none}.hero.poster .figure img,.hero.poster .figure .art{aspect-ratio:21/9}.hero.poster figcaption{position:absolute;right:0;bottom:-1.65rem;margin:0}}
@media (min-width:1100px){.hero.poster .figure img,.hero.poster .figure .art{aspect-ratio:5/2}}
/* about story */
.about.story .wrap{display:grid;gap:clamp(2rem,6vw,4rem);align-items:start}
.about.story .wrap.one{max-width:820px}
.about.story .media{margin:0;min-width:0}
.about.story .media img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius)}
.about.story figcaption{margin-top:.85rem;padding-left:1.25rem;position:relative;font-size:.8rem;color:var(--muted)}
.about.story figcaption::before{content:"";position:absolute;left:0;top:.6em;width:.75rem;height:1px;background:var(--accent)}
.about.story h2{max-width:18ch;margin:0}
.about.story .prose{margin-top:clamp(1.5rem,3vw,2.25rem);max-width:52ch}
.about.story .prose p{margin:0;font-size:1.05rem;line-height:1.65}
.about.story .prose p+p{margin-top:1.1em}
.about.story .prose p:first-child::first-letter{font-family:var(--font-heading);font-size:2.15em;line-height:.9;float:left;padding:.08em .12em 0 0}
.about.story .strip{margin:clamp(2.25rem,5vw,3.5rem) 0 0;padding-top:1.5rem;border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(auto-fit,minmax(6.5rem,1fr));gap:1rem}
.about.story .strip div{min-width:0}
.about.story .strip div+div{padding-left:1rem;border-left:1px solid var(--line)}
.about.story .strip b{display:block;font-family:var(--font-heading);font-weight:500;font-size:clamp(2rem,1.25rem + 3.2vw,3.5rem);line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.about.story .strip span{display:block;margin-top:.55rem;font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
@media (min-width:861px){.about.story .wrap.two{grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:clamp(3rem,7vw,6rem);align-items:start}.about.story .media img{aspect-ratio:4/5}.about.story .wrap.two .text{padding-top:clamp(3rem,9vw,7.5rem)}.about.story .strip{gap:1.5rem}.about.story .strip div+div{padding-left:1.5rem}}
/* services numbered */
.services.numbered .wrap{display:grid;gap:clamp(2.5rem,6vw,5rem);align-items:start}
.services.numbered .main{min-width:0}
.services.numbered h2{max-width:15ch}
.services.numbered .intro{margin-bottom:0;max-width:44ch}
.services.numbered .nlist{list-style:none;margin:clamp(2rem,4vw,3.25rem) 0 0;padding:0;counter-reset:svc;border-top:1px solid var(--line)}
.services.numbered .nlist li{counter-increment:svc;display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"num title thumb" "num desc thumb" "num price thumb";column-gap:1rem;row-gap:.3rem;align-items:start;padding:1.35rem 0 1.5rem;border-bottom:1px solid var(--line)}
.services.numbered .nlist li::before{content:counter(svc,decimal-leading-zero);grid-area:num;font-family:var(--font-heading);font-size:clamp(2.1rem,3.4vw,2.9rem);line-height:.9;font-variant-numeric:tabular-nums;color:color-mix(in srgb,var(--text) 26%,transparent);min-width:2.3ch;padding-top:.05em}
.services.numbered .nlist img{grid-area:thumb;width:3.5rem;height:3.5rem;object-fit:cover;border-radius:calc(var(--radius) * .6);margin-top:.15rem}
.services.numbered .nlist h3{grid-area:title;margin:0;font-size:clamp(1.2rem,1.7vw,1.45rem);line-height:1.2}
.services.numbered .nlist p{grid-area:desc;margin:0;font-size:.95rem;line-height:1.55;color:var(--muted);max-width:42ch}
.services.numbered .nlist .price{grid-area:price;margin:.35rem 0 0;padding:0;font-size:.95rem;font-weight:500;color:var(--text);font-variant-numeric:tabular-nums;white-space:nowrap}
.services.numbered .aside{order:-1;min-width:0}
.services.numbered .aside figure{margin:0}
.services.numbered .aside img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius)}
.services.numbered .aside figcaption{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-top:.8rem;padding-top:.7rem;border-top:1px solid var(--line);font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.services.numbered .aside a{color:var(--text);text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:.3em;letter-spacing:.06em;white-space:nowrap}
.services.numbered .aside a:hover{color:var(--primary);text-decoration-color:var(--primary)}
@media (min-width:900px){.services.numbered .wrap.two{grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:clamp(3rem,7vw,7rem)}.services.numbered .aside{order:0;position:sticky;top:6rem;align-self:start;margin-top:clamp(2rem,5vw,4.5rem)}.services.numbered .aside img{aspect-ratio:4/5}.services.numbered .nlist li{grid-template-columns:3.4rem 3.5rem minmax(9rem,.75fr) minmax(0,1.25fr) auto;grid-template-areas:"num thumb title desc price";column-gap:1.4rem;padding:1.6rem 0}.services.numbered .nlist.plain li{grid-template-columns:3.4rem minmax(9rem,.75fr) minmax(0,1.25fr) auto;grid-template-areas:"num title desc price"}.services.numbered .nlist img{margin-top:0}.services.numbered .nlist h3{padding-top:.3rem}.services.numbered .nlist p{padding-top:.4rem;max-width:none}.services.numbered .nlist .price{margin:0;padding-top:.4rem;text-align:right;min-width:5.5ch}}
/* testimonials featured */
.testimonials.featured h2{max-width:34rem;margin-bottom:clamp(2.5rem,6vw,4.5rem)}
.testimonials.featured figure{margin:0;position:relative}
.testimonials.featured blockquote{margin:0}
.testimonials.featured blockquote p{margin:0;font-family:var(--font-heading);font-size:clamp(1.125rem,1.6vw,1.3rem);line-height:1.45;text-wrap:pretty}
.testimonials.featured figcaption{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem .75rem;margin-top:1.25rem;font-size:.875rem}
.testimonials.featured figcaption b{font-weight:600;letter-spacing:.02em}
.testimonials.featured figcaption span{color:var(--muted)}
.testimonials.featured figcaption span::before{content:"";display:inline-block;width:1.25rem;height:1px;background:var(--line);vertical-align:middle;margin-right:.6rem}
.testimonials.featured .feat{padding:clamp(3rem,7vw,4.5rem) 0 clamp(2.5rem,5vw,3.5rem);border-bottom:1px solid var(--line)}
.testimonials.featured .feat::before{content:"\\201C";position:absolute;top:0;left:-.06em;font-family:var(--font-heading);font-size:clamp(6rem,16vw,11rem);line-height:.8;color:var(--accent);pointer-events:none}
.testimonials.featured .feat blockquote p{font-size:clamp(1.5rem,3.4vw,2.6rem);line-height:1.22;letter-spacing:-.01em;max-width:24ch}
.testimonials.featured .feat figcaption{margin-top:1.75rem;font-size:.9375rem}
.testimonials.featured .rest{display:grid;gap:clamp(2rem,5vw,3.5rem) clamp(2rem,6vw,5rem);margin-top:clamp(2rem,5vw,3.5rem)}
.testimonials.featured .rest blockquote p::before{content:"\\201C";color:var(--accent)}
.testimonials.featured .rest blockquote p::after{content:"\\201D";color:var(--accent)}
@media (min-width:720px){.testimonials.featured .feat{padding-left:clamp(3rem,9vw,8rem)}.testimonials.featured .feat::before{left:0;top:clamp(2.6rem,6vw,4rem)}.testimonials.featured .feat blockquote p{max-width:26ch}.testimonials.featured .rest{grid-template-columns:1fr 1fr}.testimonials.featured .rest figure:nth-child(even){padding-left:clamp(2rem,4vw,3rem);border-left:1px solid var(--line)}}
/* menu ruled */
.menu.ruled .rmenu-head{display:grid;gap:1rem;padding-bottom:clamp(1.5rem,4vw,2.5rem)}
.menu.ruled .rmenu-head h2{font-size:clamp(2.75rem,8vw,5.5rem);line-height:.95;letter-spacing:-.02em;margin:0}
.menu.ruled .rmenu-head .intro{margin:0;max-width:34em}
.menu.ruled .rcats{counter-reset:mcat;border-top:3px solid var(--text)}
.menu.ruled .rcat{counter-increment:mcat;display:grid;gap:1rem 2rem;padding:clamp(1.5rem,4vw,2.75rem) 0;border-bottom:3px solid var(--text)}
.menu.ruled .rhead{display:flex;align-items:baseline;gap:.9rem}
.menu.ruled .rhead::before{content:counter(mcat,decimal-leading-zero);font-family:var(--font-heading);font-size:.8rem;letter-spacing:.12em;color:var(--muted);font-variant-numeric:tabular-nums}
.menu.ruled .rhead h3{margin:0;font-size:clamp(1.5rem,3vw,2.25rem);line-height:1.05;letter-spacing:-.01em}
.menu.ruled .ritems{list-style:none;margin:0;padding:0}
.menu.ruled .ritems li{display:grid;grid-template-columns:minmax(0,auto) minmax(1.5rem,1fr) auto;align-items:baseline;column-gap:.75rem;padding:.85rem 0;border-top:1px solid var(--line)}
.menu.ruled .ritems li:first-child{border-top:0;padding-top:0}
.menu.ruled .ritems li:last-child{padding-bottom:0}
.menu.ruled .ritems .name{font-size:clamp(1rem,1.3vw,1.125rem);line-height:1.4;overflow-wrap:anywhere}
.menu.ruled .ritems .leader{align-self:end;height:0;margin-bottom:.45em;border-bottom:1px dotted color-mix(in srgb,var(--muted) 55%,transparent)}
.menu.ruled .ritems .p{font-family:var(--font-heading);font-size:clamp(1rem,1.3vw,1.125rem);font-weight:500;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.menu.ruled .ritems .desc{grid-column:1 / -1;font-size:.9rem;line-height:1.45;color:var(--muted);margin-top:.15rem;padding-right:4rem}
@media (min-width:760px){.menu.ruled .rmenu-head{grid-template-columns:1fr 1fr;align-items:end;gap:2rem}.menu.ruled .rmenu-head .intro{justify-self:end}.menu.ruled .rcat{grid-template-columns:minmax(12rem,1fr) 2fr;gap:0 clamp(2rem,6vw,5rem);align-items:start}.menu.ruled .rhead{position:sticky;top:6rem}.menu.ruled .ritems .desc{padding-right:6rem}}
/* gallery editorial */
.gallery.editorial .egrid{display:grid;grid-template-columns:1fr;grid-auto-flow:dense;column-gap:clamp(1rem,2.5vw,1.5rem);row-gap:clamp(1.75rem,4vw,2.75rem);counter-reset:gph}
.gallery.editorial .ehead{padding-bottom:clamp(.5rem,2vw,1rem)}
.gallery.editorial .ehead h2{max-width:14ch;margin:0}
.gallery.editorial .ehead .intro{margin:1rem 0 0}
.gallery.editorial .rule{display:block;width:3.5rem;height:1px;margin-top:clamp(1.25rem,3vw,2rem);background:var(--text)}
.gallery.editorial figure{margin:0;display:flex;flex-direction:column;min-width:0;counter-increment:gph}
.gallery.editorial img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius)}
.gallery.editorial figcaption{display:flex;align-items:baseline;gap:.75rem;margin-top:.85rem;padding-top:.65rem;border-top:1px solid var(--line);font-size:.8125rem;line-height:1.45;color:var(--muted)}
.gallery.editorial figcaption::before{content:counter(gph,decimal-leading-zero);flex:none;font-family:var(--font-heading);font-size:.75rem;letter-spacing:.08em;font-variant-numeric:tabular-nums;color:var(--accent)}
.gallery.editorial figure:first-of-type img{aspect-ratio:4/5}
@media (min-width:640px){.gallery.editorial .egrid{grid-template-columns:repeat(2,minmax(0,1fr))}.gallery.editorial .ehead{grid-column:1 / -1;padding-bottom:0}.gallery.editorial figure:first-of-type img{aspect-ratio:4/3}}
@media (min-width:960px){.gallery.editorial .egrid{grid-template-columns:repeat(3,minmax(0,1fr))}.gallery.editorial .egrid:not(.nohead) .ehead{grid-column:1 / span 2;grid-row:1;align-self:end;padding-right:clamp(2rem,6vw,5rem)}.gallery.editorial .egrid:not(.nohead) figure:first-of-type{grid-column:3;grid-row:1 / span 2}.gallery.editorial .egrid:not(.nohead) figure:first-of-type img{flex:1 1 auto;min-height:0;height:100%;aspect-ratio:auto}.gallery.editorial .egrid:not(.nohead) figure:first-of-type figcaption{flex:none}}
/* gallery filmstrip */
.gallery.filmstrip .fhead{display:grid;grid-template-columns:1fr auto;align-items:end;column-gap:1.5rem;padding-bottom:1.25rem;margin-bottom:clamp(1.5rem,4vw,2.5rem);position:relative}
.gallery.filmstrip .fhead::before{content:"";position:absolute;left:var(--pad);right:var(--pad);bottom:0;height:1px;background:var(--line)}
.gallery.filmstrip .fhead::after{content:"";position:absolute;left:var(--pad);bottom:0;width:3.5rem;height:1px;background:var(--primary)}
.gallery.filmstrip .fhead h2{margin:0}
.gallery.filmstrip .fhead .intro{margin:.75rem 0 0}
.gallery.filmstrip .hint{color:var(--muted);display:inline-flex}
.gallery.filmstrip .hint .arr{width:28px;height:14px}
.gallery.filmstrip .film{list-style:none;margin:0;padding:0 var(--pad) 1rem;display:flex;gap:.75rem;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;scroll-padding-inline:var(--pad);scrollbar-width:thin;counter-reset:frm}
.gallery.filmstrip .film li{flex:0 0 min(78vw,22rem);scroll-snap-align:start;counter-increment:frm}
.gallery.filmstrip .film figure{margin:0}
.gallery.filmstrip .film figure::after{content:counter(frm,decimal-leading-zero);display:block;margin-top:.6rem;font-size:.7rem;letter-spacing:.16em;color:var(--muted);font-variant-numeric:tabular-nums}
.gallery.filmstrip img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--radius)}
@media (min-width:900px){.gallery.filmstrip .hint{display:none}.gallery.filmstrip .film{max-width:var(--wrap);margin:0 auto;padding:0 var(--pad);display:grid;grid-template-columns:repeat(var(--n,6),minmax(0,1fr));gap:1rem;overflow:visible;scroll-snap-type:none}.gallery.filmstrip .film li{flex:none;min-width:0}.gallery.filmstrip .film li:nth-child(even){padding-top:2.5rem}.gallery.filmstrip .film li:first-child figure::after,.gallery.filmstrip .film li:last-child figure::after{color:var(--primary)}}
@media (min-width:1200px){.gallery.filmstrip .film{gap:1.25rem}.gallery.filmstrip .film li:nth-child(even){padding-top:3.5rem}}
/* faq numbered + open */
.faq.numbered .wrap,.faq.open .wrap{max-width:var(--wrap)}
.faq .fwrap{display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(2.5rem,6vw,5rem)}
.faq .fhead{min-width:0}
.faq .fhead h2{max-width:14ch;margin:0}
.faq .fhead .note{margin:1.5rem 0 0;font-size:.95rem;color:var(--muted)}
.faq .fhead .note a{color:var(--text);text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--text) 35%,transparent);text-underline-offset:.18em}
.faq .fhead .note a:hover{color:var(--primary);text-decoration-color:var(--primary)}
.faq.numbered .flist{min-width:0;counter-reset:fq;border-top:1px solid var(--line)}
.faq.numbered details{counter-increment:fq;padding:0}
.faq.numbered summary{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:baseline;column-gap:clamp(.9rem,2.5vw,1.75rem);padding:clamp(1.15rem,2.4vw,1.6rem) 0;font-weight:inherit;font-size:inherit}
.faq.numbered summary::after{content:none}
.faq.numbered summary .n::before{content:counter(fq,decimal-leading-zero);font-size:.72rem;letter-spacing:.12em;color:var(--muted);font-variant-numeric:tabular-nums}
.faq.numbered summary .q{font-family:var(--font-heading);font-weight:500;font-size:clamp(1.1rem,1rem + .55vw,1.45rem);line-height:1.25;overflow-wrap:anywhere}
.faq.numbered summary .plus{align-self:center;color:var(--primary);transition:transform .2s ease}
.faq.numbered summary:hover .q,.faq.numbered details[open] .q{color:var(--primary)}
.faq.numbered details[open] .plus{transform:rotate(45deg)}
.faq.numbered .a{display:grid;grid-template-columns:auto minmax(0,1fr) auto;column-gap:clamp(.9rem,2.5vw,1.75rem)}
.faq.numbered .a::before{content:"";width:1.4em;font-size:.72rem;letter-spacing:.12em}
.faq.numbered .a p{grid-column:2;margin:0;max-width:52ch;padding-bottom:clamp(1.25rem,2.6vw,1.75rem);line-height:1.65}
.faq.open .olist{margin:0;display:grid;grid-template-columns:1fr;column-gap:clamp(2rem,5vw,4.5rem);counter-reset:fq;border-bottom:1px solid var(--line)}
.faq.open .olist>div{counter-increment:fq;border-top:1px solid var(--line);padding:1.5rem 0 1.75rem;display:grid;grid-template-columns:2.75rem 1fr;column-gap:.75rem}
.faq.open .olist>div::before{content:counter(fq,decimal-leading-zero);grid-row:1 / span 2;font-family:var(--font-heading);font-size:.8rem;letter-spacing:.08em;line-height:1.7;color:var(--muted);font-variant-numeric:tabular-nums}
.faq.open dt{margin:0;font-weight:700;font-size:clamp(1.05rem,.95rem + .4vw,1.2rem);line-height:1.4}
.faq.open dd{margin:.6rem 0 0;font-size:1rem;line-height:1.65;color:var(--muted);max-width:48ch}
@media (min-width:720px){.faq.open .olist{grid-template-columns:1fr 1fr}.faq.open .olist>div{padding:2rem 0 2.25rem}}
@media (min-width:1000px){.faq .fwrap{grid-template-columns:minmax(0,5fr) minmax(0,7fr);align-items:start}.faq .fhead{position:sticky;top:6rem}.faq.numbered .flist{margin-top:.45rem}}
/* contact table + address */
.contact .chead{max-width:34ch;margin-bottom:clamp(2.5rem,6vw,4.5rem)}
.contact .chead h2{margin:0}
.contact .chead .intro{margin:1.25rem 0 0;max-width:42ch}
.contact.table .cgrid{display:grid;grid-template-columns:1fr;gap:clamp(3rem,6vw,5rem);border-top:1px solid var(--line);padding-top:clamp(2rem,4vw,3rem)}
.contact.table .hours-t{width:100%;border-collapse:collapse;margin:0 0 clamp(2rem,4vw,3rem)}
.contact.table .hours-t tr{border-bottom:1px solid var(--line)}
.contact.table .hours-t tr:first-child{border-top:1px solid var(--line)}
.contact.table .hours-t th,.contact.table .hours-t td{padding:.9rem 0;vertical-align:baseline}
.contact.table .hours-t th{text-align:left;font-weight:400}
.contact.table .hours-t td{text-align:right;font-family:var(--font-heading);font-size:clamp(1.25rem,2vw,1.5rem);font-variant-numeric:tabular-nums;white-space:nowrap}
.contact.table .details{display:grid;gap:1.1rem}
.contact.table .details>div{display:grid;grid-template-columns:1.6rem 1fr;gap:.85rem;align-items:center}
.contact.table .details .ic{color:var(--accent);width:20px;height:20px}
.contact.table .details a:hover{text-decoration:underline}
.contact.table .info .actions,.contact.table .info .map{margin-top:2rem}
.contact.table form.lead-form{background:transparent;border:0;padding:0;border-radius:0;gap:clamp(1.5rem,2.5vw,2rem)}
.contact.table form.lead-form label{gap:.4rem;font-size:.75rem;font-weight:400;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.contact.table form.lead-form input,.contact.table form.lead-form textarea{padding:.6rem 0;font-size:1.1rem;line-height:1.4;background:transparent;border:0;border-bottom:1px solid var(--line);border-radius:0;color:var(--text)}
.contact.table form.lead-form input:hover,.contact.table form.lead-form textarea:hover{border-bottom-color:color-mix(in srgb,var(--text) 50%,var(--line))}
.contact.table form.lead-form input:focus,.contact.table form.lead-form textarea:focus{outline:none;border-bottom-color:var(--primary);box-shadow:0 1px 0 0 var(--primary)}
.contact.table form.lead-form .btn{justify-self:start}
@media (min-width:880px){.contact.table .cgrid.two{grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:clamp(4rem,8vw,8rem)}}
.contact.address .wrap{display:grid;gap:clamp(2.5rem,6vw,4.5rem)}
.contact.address .chead{margin-bottom:0}
.contact.address .big{border-top:1px solid var(--line);padding-top:clamp(1.5rem,3vw,2.5rem)}
.contact.address .street{margin:0;font-family:var(--font-heading);font-size:clamp(1.9rem,7vw,4.75rem);line-height:1.02;letter-spacing:-.015em;overflow-wrap:anywhere;text-wrap:balance}
.contact.address .links{list-style:none;margin:clamp(1.25rem,3vw,2rem) 0 0;padding:0;display:flex;flex-wrap:wrap;gap:1.25rem 3rem}
.contact.address .links li{display:flex;align-items:center;gap:.6rem}
.contact.address .links .ic{color:var(--accent);width:20px;height:20px}
.contact.address .links a{font-size:clamp(1.05rem,1.5vw,1.25rem);border-bottom:1px solid color-mix(in srgb,var(--text) 35%,transparent);padding-bottom:.15rem}
.contact.address .links a:hover{color:var(--primary);border-bottom-color:var(--primary)}
.contact.address .hrow{margin:0;display:grid;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.contact.address .hrow>div{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;padding:1rem 0}
.contact.address .hrow>div+div{border-top:1px solid var(--line)}
.contact.address dt{font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.contact.address dd{margin:0;font-family:var(--font-heading);font-size:clamp(1.15rem,1.8vw,1.5rem);line-height:1.2;font-variant-numeric:tabular-nums;white-space:nowrap}
.contact.address .actions{margin:0}
.contact.address form.lead-form{background:transparent;border:0;padding:0;border-radius:0;gap:1.75rem;max-width:44rem}
.contact.address form.lead-form label{gap:.5rem;font-size:.75rem;font-weight:400;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.contact.address form.lead-form input,.contact.address form.lead-form textarea{font-size:1.05rem;line-height:1.5;background:color-mix(in srgb,var(--text) 3%,transparent);border:0;border-bottom:1px solid var(--line);border-radius:0;padding:.8rem .75rem;color:var(--text)}
.contact.address form.lead-form input:focus,.contact.address form.lead-form textarea:focus{outline:none;border-bottom-color:var(--primary);box-shadow:0 1px 0 0 var(--primary);background:color-mix(in srgb,var(--primary) 6%,transparent)}
.contact.address form.lead-form textarea{min-height:8.5rem}
.contact.address form.lead-form .btn{width:100%;padding:1.05rem 1.5rem;margin-top:.25rem}
@media (min-width:800px){.contact.address .hrow{grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))}.contact.address .hrow>div{flex-direction:column;align-items:flex-start;gap:.6rem;padding:1.5rem 2rem 1.5rem 0}.contact.address .hrow>div+div{border-top:0;border-left:1px solid var(--line);padding-left:2rem}.contact.address form.lead-form{grid-template-columns:1fr 1fr;column-gap:2rem}.contact.address form.lead-form label:has(textarea),.contact.address form.lead-form .btn,.contact.address form.lead-form .form-note,.contact.address form.lead-form .form-msg{grid-column:1 / -1}}
/* cta framed + overlap */
.cta.framed .band{background:var(--primary);color:var(--on-primary);border-radius:var(--radius);padding:clamp(.85rem,2vw,1.25rem)}
.cta.framed .frame{border:1px solid color-mix(in srgb,var(--on-primary) 32%,transparent);border-radius:calc(var(--radius) - 4px);padding:clamp(2rem,6vw,4.5rem) clamp(1.5rem,5vw,4rem);display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(2rem,5vw,3.5rem);align-items:center}
.cta.framed .copy{min-width:0}
.cta.framed h2{color:inherit;font-size:clamp(2.1rem,5.5vw,3.9rem);line-height:1.04;letter-spacing:-.015em;max-width:14ch;margin:0}
.cta.framed p{margin:clamp(1rem,2.5vw,1.5rem) 0 0;font-size:clamp(1rem,1.4vw,1.15rem);line-height:1.55;max-width:34ch;color:color-mix(in srgb,var(--on-primary) 82%,var(--primary))}
.cta.framed .actions{margin-top:clamp(1.5rem,3vw,2.25rem)}
.cta.framed .media{margin:0;min-width:0}
.cta.framed .media img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:calc(var(--radius) - 6px)}
@media (min-width:900px){.cta.framed .frame.two{grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:clamp(3rem,6vw,5rem)}.cta.framed .media img{aspect-ratio:5/4}}
.cta.overlap{overflow:hidden}
.cta.overlap .photo{margin:0;width:100%;aspect-ratio:3/2;overflow:hidden;border-radius:var(--radius)}
.cta.overlap .photo img{width:100%;height:100%;object-fit:cover}
.cta.overlap .panel{position:relative;z-index:1;margin:-3.5rem 1rem 0;padding:clamp(1.75rem,3vw + 1rem,3.5rem);background:var(--primary);color:var(--on-primary);border-radius:var(--radius)}
.cta.overlap .rule{display:block;width:3rem;height:1px;margin-bottom:1.5rem;background:color-mix(in srgb,var(--on-primary) 55%,transparent)}
.cta.overlap h2{color:inherit;font-size:clamp(1.9rem,1.1rem + 3.2vw,3.25rem);line-height:1.05;letter-spacing:-.015em;max-width:14ch;margin:0}
.cta.overlap p{margin:1.25rem 0 0;max-width:34ch;font-size:clamp(.98rem,.9rem + .35vw,1.125rem);line-height:1.55;color:color-mix(in srgb,var(--on-primary) 82%,transparent)}
.cta.overlap .actions{margin-top:2rem}
@media (min-width:720px){.cta.overlap .photo{aspect-ratio:21/7}.cta.overlap .panel{width:min(38rem,62%);margin:-7rem auto 0 clamp(1.5rem,5vw,4.5rem)}.cta.overlap .rule{margin-bottom:2rem}}
@media (min-width:1100px){.cta.overlap .photo{aspect-ratio:3/1}.cta.overlap .panel{margin-top:-8.5rem}}
`;
