"""CSV value coercion tests — T+1450.

The CSV adapter promotes string values to native types so the JSONB
properties column doesn't fill up with stringified scalars. Behaviour
needs to be conservative — leave ambiguous values as strings rather
than guess wrong.
"""

from __future__ import annotations

from twin_api.feeds.csv_url import _coerce_value


def test_empty_string_becomes_none():
    assert _coerce_value("") is None
    assert _coerce_value("   ") is None


def test_none_passthrough():
    assert _coerce_value(None) is None


def test_booleans():
    assert _coerce_value("true") is True
    assert _coerce_value("FALSE") is False
    assert _coerce_value("Yes") is True
    assert _coerce_value("no") is False


def test_null_strings():
    assert _coerce_value("null") is None
    assert _coerce_value("NA") is None
    assert _coerce_value("n/a") is None


def test_integers():
    assert _coerce_value("42") == 42
    assert _coerce_value("-7") == -7
    assert _coerce_value("0") == 0
    assert _coerce_value("100") == 100


def test_floats():
    assert _coerce_value("3.14") == 3.14
    assert _coerce_value("-0.5") == -0.5
    assert _coerce_value("1e3") == 1000.0


def test_leading_zero_kept_as_string():
    """Numbers like postcodes or zero-padded IDs keep their leading
    zero — coerce should not promote ``"007"`` to int(7)."""
    assert _coerce_value("007") == "007"
    assert _coerce_value("0123") == "0123"
    # But "0.5" is a float, not a leading-zero string
    assert _coerce_value("0.5") == 0.5


def test_real_strings_stay_strings():
    assert _coerce_value("hello") == "hello"
    assert _coerce_value("WATER MAIN") == "WATER MAIN"
    assert _coerce_value("DICL") == "DICL"
