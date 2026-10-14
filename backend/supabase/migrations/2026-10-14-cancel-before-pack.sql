-- Customers can cancel only while an order is placed or confirmed.
-- Once it is packed for delivery, cancellation is refused (stock stays reserved).
-- Paste this file into the Supabase SQL Editor and Run. Safe to run again.
-- The API also refuses the same statuses, so the button is blocked even before this is pasted.
-- After pasting, staff can no longer cancel a packed order from the admin drawer either.

SET search_path = public, account, catalog, marketing, sales, payment, ops;

CREATE OR REPLACE FUNCTION change_order_status(p_order_id TEXT, p_to "OrderStatus", p_note TEXT,
                                               p_carrier TEXT DEFAULT NULL, p_tracking TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql
SET search_path = account, catalog, marketing, sales, payment, ops, public
AS $$
DECLARE
  ord sales."Order"%ROWTYPE;
  flow TEXT[] := ARRAY['PLACED','CONFIRMED','PACKED','SHIPPED','OUT_FOR_DELIVERY','DELIVERED'];
  ok BOOLEAN;
BEGIN
  SELECT * INTO ord FROM sales."Order" WHERE "id" = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING HINT = 'Order'; END IF;
  ok := CASE
    WHEN p_to = 'CANCELLED' THEN ord."status"::text = ANY (ARRAY['PLACED','CONFIRMED'])
    WHEN p_to = 'RETURNED'  THEN ord."status"::text = ANY (ARRAY['SHIPPED','OUT_FOR_DELIVERY','DELIVERED'])
    ELSE array_position(flow, p_to::text) IS NOT NULL AND array_position(flow, ord."status"::text) IS NOT NULL
         AND array_position(flow, p_to::text) > array_position(flow, ord."status"::text)
  END;
  IF NOT ok THEN
    RAISE EXCEPTION 'BAD_TRANSITION' USING DETAIL = ord."status"::text, HINT = p_to::text;
  END IF;
  IF p_to = 'CANCELLED' THEN PERFORM restore_stock(p_order_id, 'CANCELLATION', p_note); END IF;
  IF p_to = 'RETURNED'  THEN PERFORM restore_stock(p_order_id, 'RETURN', p_note); END IF;
  INSERT INTO sales."OrderEvent" ("orderId", "status", "note") VALUES (p_order_id, p_to, p_note);
  UPDATE sales."Order" SET
    "status" = p_to,
    "carrier" = COALESCE(p_carrier, "carrier"),
    "trackingNumber" = COALESCE(p_tracking, "trackingNumber"),
    "paymentStatus" = CASE WHEN p_to = 'DELIVERED' AND ord."paymentMethod" = 'COD' THEN 'PAID'::"PaymentStatus" ELSE "paymentStatus" END
  WHERE "id" = p_order_id;
  IF p_to = 'DELIVERED' AND ord."paymentMethod" = 'COD' THEN
    UPDATE payment."Payment" SET "status" = 'PAID' WHERE "orderId" = p_order_id AND "provider" = 'cod';
  END IF;
  IF p_to IN ('SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED') OR p_carrier IS NOT NULL OR p_tracking IS NOT NULL THEN
    INSERT INTO sales."Shipment" ("orderId", "carrier", "trackingNumber", "shippedAt", "deliveredAt")
    VALUES (
      p_order_id,
      COALESCE(p_carrier, ord."carrier"),
      COALESCE(p_tracking, ord."trackingNumber"),
      CASE WHEN p_to IN ('SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED') THEN CURRENT_TIMESTAMP ELSE NULL END,
      CASE WHEN p_to = 'DELIVERED' THEN CURRENT_TIMESTAMP ELSE NULL END
    )
    ON CONFLICT ("orderId") DO UPDATE SET
      "carrier" = COALESCE(EXCLUDED."carrier", "Shipment"."carrier"),
      "trackingNumber" = COALESCE(EXCLUDED."trackingNumber", "Shipment"."trackingNumber"),
      "shippedAt" = COALESCE("Shipment"."shippedAt", EXCLUDED."shippedAt"),
      "deliveredAt" = CASE WHEN p_to = 'DELIVERED' THEN CURRENT_TIMESTAMP ELSE "Shipment"."deliveredAt" END;
  END IF;
  RETURN jsonb_build_object('orderId', p_order_id, 'from', ord."status", 'paymentMethod', ord."paymentMethod", 'paymentStatus', ord."paymentStatus");
END $$;
