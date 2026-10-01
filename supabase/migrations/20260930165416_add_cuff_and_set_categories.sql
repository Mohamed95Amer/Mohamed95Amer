alter table public.products
  drop constraint if exists products_category_check;

alter table public.products
  add constraint products_category_check check (category in (
    'ring','necklace','bracelet','cuff','earring','bangle','set','chain','pendant','bar','coin','other'
  ));

alter table public.buyer_requests
  drop constraint if exists buyer_requests_category_check;

alter table public.buyer_requests
  add constraint buyer_requests_category_check check (category in (
    'ring','necklace','bracelet','cuff','earring','bangle','set','chain','pendant','bar','coin','other'
  ));
