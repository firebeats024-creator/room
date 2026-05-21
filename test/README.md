# Calculator App - Flutter Mobile Application

A modern calculator app built with Flutter featuring a sleek dark theme and intuitive interface.

## Features

- Basic arithmetic operations: addition, subtraction, multiplication, division
- Percentage calculation
- Toggle positive/negative
- Backspace to delete last digit
- Expression history display
- Responsive design for all screen sizes
- Haptic feedback on button press
- Modern UI with gradient buttons

## Requirements

- Flutter SDK (>=3.0.0)
- Dart SDK (>=3.0.0)
- Android Studio / VS Code with Flutter extensions
- Android/iOS Emulator or Physical Device

## Installation

1. Install Flutter SDK from [flutter.dev](https://flutter.dev/docs/get-started/install)
2. Run `flutter doctor` to verify installation
3. Navigate to the project directory
4. Run `flutter pub get` to install dependencies
5. Run `flutter run` to start the app

## Project Structure

```
lib/
├── main.dart                    # App entry point
├── logic/
│   └── calculator_logic.dart   # Calculator business logic
└── screens/
    └── calculator_screen.dart  # UI components
```

## Building for Production

### Android
```bash
flutter build apk --release
```

### iOS
```bash
flutter build ios --release
```

## Screenshots

The app features:
- Dark theme with orange accent colors
- Large, easy-to-read display
- Color-coded buttons (gray for functions, orange for operators, dark gray for numbers)
- Smooth animations and haptic feedback
