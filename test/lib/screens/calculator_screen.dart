import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../logic/calculator_logic.dart';

class CalculatorScreen extends StatefulWidget {
  const CalculatorScreen({super.key});

  @override
  State<CalculatorScreen> createState() => _CalculatorScreenState();
}

class _CalculatorScreenState extends State<CalculatorScreen> {
  final CalculatorLogic _logic = CalculatorLogic();

  void _onButtonPressed(String value) {
    setState(() {
      _logic.handleInput(value);
    });
    HapticFeedback.lightImpact();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              flex: 2,
              child: _buildDisplay(),
            ),
            Expanded(
              flex: 4,
              child: _buildButtons(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDisplay() {
    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          const Text(
            'Calculator',
            style: TextStyle(
              fontSize: 18,
              color: Colors.grey,
              fontWeight: FontWeight.w500,
            ),
          ),
          const Spacer(),
          Text(
            _logic.expression.isEmpty ? '' : _logic.expression,
            style: const TextStyle(
              fontSize: 28,
              color: Colors.grey,
              fontWeight: FontWeight.w300,
            ),
            textAlign: TextAlign.right,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 12),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerRight,
            child: Text(
              _logic.result,
              style: const TextStyle(
                fontSize: 64,
                fontWeight: FontWeight.bold,
                color: Colors.white,
                letterSpacing: 1.2,
              ),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildButtons() {
    final buttons = [
      ['C', '±', '%', '÷'],
      ['7', '8', '9', '×'],
      ['4', '5', '6', '-'],
      ['1', '2', '3', '+'],
      ['0', '.', '⌫', '='],
    ];

    return Column(
      children: buttons.map((row) {
        return Expanded(
          child: Row(
            children: row.map((btn) {
              return Expanded(
                child: _buildButton(btn),
              );
            }).toList(),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildButton(String text) {
    Color bgColor;
    Color textColor;
    double fontSize = 32;

    if (['C', '±', '%'].contains(text)) {
      bgColor = Colors.grey.shade600;
      textColor = Colors.white;
    } else if (['÷', '×', '-', '+', '='].contains(text)) {
      bgColor = Colors.orange.shade600;
      textColor = Colors.white;
      fontSize = 36;
    } else {
      bgColor = Colors.grey.shade800;
      textColor = Colors.white;
    }

    return Padding(
      padding: const EdgeInsets.all(6),
      child: Material(
        color: bgColor,
        borderRadius: BorderRadius.circular(20),
        elevation: 2,
        shadowColor: Colors.black,
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: () => _onButtonPressed(text),
          splashColor: Colors.white.withOpacity(0.2),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  bgColor.withOpacity(0.8),
                  bgColor,
                ],
              ),
            ),
            child: Center(
              child: Text(
                text,
                style: TextStyle(
                  fontSize: fontSize,
                  fontWeight: FontWeight.w600,
                  color: textColor,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
