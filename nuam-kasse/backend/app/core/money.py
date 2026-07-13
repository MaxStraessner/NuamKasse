from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


MAX_MONEY_AMOUNT = Decimal("999999999.99")
MONEY_QUANT = Decimal("0.01")
SUPPORTED_CURRENCY = "THB"


class MoneyError(ValueError):
    pass


def parse_money(value: str | Decimal) -> Decimal:
    if isinstance(value, float):
        raise MoneyError("Geldbeträge dürfen nicht als Float verarbeitet werden.")
    if isinstance(value, Decimal):
        amount = value
    else:
        clean_value = str(value).strip().replace(",", ".")
        if not clean_value:
            raise MoneyError("Der Ausgangsbetrag darf nicht leer sein.")
        try:
            amount = Decimal(clean_value)
        except InvalidOperation as exc:
            raise MoneyError("Der Ausgangsbetrag ist ungültig.") from exc

    if amount.as_tuple().exponent < -2:
        raise MoneyError("Der Ausgangsbetrag darf höchstens zwei Nachkommastellen haben.")
    amount = amount.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    if amount <= 0:
        raise MoneyError("Der Ausgangsbetrag muss größer als 0 sein.")
    if amount > MAX_MONEY_AMOUNT:
        raise MoneyError("Der Ausgangsbetrag ist zu hoch.")
    return amount


def validate_currency(currency: str) -> str:
    clean_currency = currency.strip().upper()
    if clean_currency != SUPPORTED_CURRENCY:
        raise MoneyError("In dieser Version ist nur THB erlaubt.")
    return clean_currency


def format_money(value: Decimal) -> str:
    return str(value.quantize(MONEY_QUANT))
