from app.api.products import MAX_IMPORT_ROWS, parse_rows


def test_csv_preview_stops_at_bounded_row_count():
    header = "sku,name,variation_sku,selling_price,initial_stock\n"
    rows = "".join(
        f"SKU-{number},Produk {number},SKU-{number},1000,1\n"
        for number in range(MAX_IMPORT_ROWS + 1)
    )

    valid, errors = parse_rows("produk.csv", (header + rows).encode())

    assert len(valid) == MAX_IMPORT_ROWS
    assert errors[-1]["message"].startswith("Maksimal")
