-- New orders use an explicit vendor-confirmed offer, customer acceptance,
-- direct-payment verification and fulfilment state machine.  Keep `paid` for
-- historical rows; new direct-payment orders advance through the states below.
alter type public.reservation_status add value if not exists 'vendor_confirmed';
alter type public.reservation_status add value if not exists 'payment_verification';
alter type public.reservation_status add value if not exists 'payment_confirmed';
alter type public.reservation_status add value if not exists 'preparing_order';
alter type public.reservation_status add value if not exists 'ready_for_delivery';
alter type public.reservation_status add value if not exists 'out_for_delivery';
alter type public.reservation_status add value if not exists 'delivered';
alter type public.reservation_status add value if not exists 'completed';
