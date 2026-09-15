from datetime import datetime

import pytest

from app.services.invoices import format_invoice, validate_invoice_period


def test_invoice_format_for_october_2026():
    assert format_invoice(2026, 10, 1, 1) == "P1020261001"
    assert format_invoice(2026, 10, 2, 42) == "P1020262042"


def test_invoice_period_must_match_transaction_date():
    validate_invoice_period("P1020261001", datetime(2026, 10, 14, 8, 0), 1)
    with pytest.raises(Exception):
        validate_invoice_period("P0920261001", datetime(2026, 10, 14, 8, 0), 1)
    with pytest.raises(Exception):
        validate_invoice_period("P1020262001", datetime(2026, 10, 14, 8, 0), 1)
