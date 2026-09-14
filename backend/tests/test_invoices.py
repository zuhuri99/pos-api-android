from datetime import datetime

import pytest

from app.services.invoices import format_invoice, validate_invoice_period


def test_invoice_format_for_october_2026():
    assert format_invoice(2026, 10, 1) == "P1020260001"
    assert format_invoice(2026, 10, 42) == "P1020260042"


def test_invoice_period_must_match_transaction_date():
    validate_invoice_period("P1020260001", datetime(2026, 10, 14, 8, 0))
    with pytest.raises(Exception):
        validate_invoice_period("P0920260001", datetime(2026, 10, 14, 8, 0))

