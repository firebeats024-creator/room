class CalculatorLogic {
  String _expression = '';
  String _result = '0';

  String get expression => _expression;
  String get result => _result;

  void handleInput(String input) {
    switch (input) {
      case 'C':
        _clear();
        break;
      case '⌫':
        _backspace();
        break;
      case '=':
        _calculate();
        break;
      case '±':
        _toggleSign();
        break;
      case '%':
        _percentage();
        break;
      case '+':
      case '-':
      case '×':
      case '÷':
        _operator(input);
        break;
      default:
        _numberOrDecimal(input);
    }
  }

  void _clear() {
    _expression = '';
    _result = '0';
  }

  void _backspace() {
    if (_expression.isNotEmpty) {
      _expression = _expression.substring(0, _expression.length - 1);
      if (_expression.isEmpty) {
        _result = '0';
      }
    }
  }

  void _operator(String op) {
    if (_expression.isEmpty && _result != '0') {
      _expression = _result + ' ' + op + ' ';
    } else if (_expression.isNotEmpty) {
      String lastChar = _expression.trim().split('').last;
      if (['+', '-', '×', '÷'].contains(lastChar)) {
        _expression = _expression.trim().substring(0, _expression.trim().length - 1) + ' ' + op + ' ';
      } else {
        _expression += ' ' + op + ' ';
      }
    }
  }

  void _numberOrDecimal(String value) {
    if (_result == '0' && value != '.') {
      _expression = value;
    } else {
      _expression += value;
    }
  }

  void _calculate() {
    try {
      if (_expression.isEmpty) return;
      
      String evalExpression = _expression
          .replaceAll('×', '*')
          .replaceAll('÷', '/')
          .replaceAll(' ', '');
      
      double result = _evaluate(evalExpression);
      
      if (result == result.toInt() && !result.toString().contains('e')) {
        _result = result.toInt().toString();
      } else {
        _result = result.toStringAsFixed(8).replaceAll(RegExp(r'0*$'), '').replaceAll(RegExp(r'\.$'), '');
      }
      
      _expression = '';
    } catch (e) {
      _result = 'Error';
      _expression = '';
    }
  }

  double _evaluate(String expression) {
    return _parseAddSub(expression);
  }

  double _parseAddSub(String expression) {
    double result = _parseMulDiv(expression);
    
    int i = 0;
    while (i < expression.length) {
      if (expression[i] == '+') {
        i++;
        int start = i;
        while (i < expression.length && expression[i] != '+' && expression[i] != '-') {
          i++;
        }
        result += _parseMulDiv(expression.substring(start, i));
      } else if (expression[i] == '-') {
        i++;
        int start = i;
        while (i < expression.length && expression[i] != '+' && expression[i] != '-') {
          i++;
        }
        result -= _parseMulDiv(expression.substring(start, i));
      } else {
        i++;
      }
    }
    
    return result;
  }

  double _parseMulDiv(String expression) {
    double result = _parseNumber(expression);
    
    int i = 0;
    while (i < expression.length) {
      if (expression[i] == '*') {
        i++;
        int start = i;
        while (i < expression.length && expression[i] != '*' && expression[i] != '/') {
          i++;
        }
        result *= _parseNumber(expression.substring(start, i));
      } else if (expression[i] == '/') {
        i++;
        int start = i;
        while (i < expression.length && expression[i] != '*' && expression[i] != '/') {
          i++;
        }
        double divisor = _parseNumber(expression.substring(start, i));
        if (divisor == 0) throw Exception('Division by zero');
        result /= divisor;
      } else {
        i++;
      }
    }
    
    return result;
  }

  double _parseNumber(String expression) {
    if (expression.isEmpty) return 0;
    
    int i = 0;
    while (i < expression.length && (expression[i].contains(RegExp(r'[0-9.]')) || (i == 0 && expression[i] == '-'))) {
      i++;
    }
    
    String numStr = expression.substring(0, i);
    if (numStr.isEmpty || numStr == '-') return 0;
    return double.parse(numStr);
  }

  void _toggleSign() {
    if (_result != '0') {
      if (_result.startsWith('-')) {
        _result = _result.substring(1);
      } else {
        _result = '-' + _result;
      }
      _expression = _result;
    }
  }

  void _percentage() {
    try {
      double value = double.parse(_result);
      _result = (value / 100).toString();
      _expression = _result;
    } catch (e) {
      _result = 'Error';
    }
  }
}
