# Change Log

## [1.6.2]
### Fixed
- Fixed bug with composer.json

## [1.6.1]
### Changed 
- Migrated to Typescript from Javascript

### Fixed
- Fixed error messages


## [1.6.0]
### Added
- Insert snippets at current cursor position

### Changed
- Changed error messages

## [1.5.1]
### Fixed
- Minor fixes

## [1.5.0]
### Added
- Parsing autoload from composer.json dependencies, so now you can easily implement interface methods from other packages

## [1.4.0] - [1.4.1]
### Added
- An option to import `composer.json` autoload paths instead of manually writing it in `php-implementor.autoloads`

### Fixed
- Bugs with comments preventing correct parsing of php files
- Other minor bug fixes

## [1.3.4]
### Changed
- Minor readme changes

## [1.3.1] - [1.3.3]
### Fixed
- Compatibility with older VSCode versions

## [1.3.0]
### Added
- Support for all type of **use..** declarations

### Fixed
- Error when no method is picked to be implemented

## [1.2.0]
### Changed
- Now user can choose which methods to implement
- Updated demonstration gif in readme.md 

## [1.1.0]
### Added
- Go to settings action in notification when file is not found
- Option to disable the display of the command in the context menu ("Settings"->"Extensions"->"PHP Implementor")
- Other minor changes

### Fixed
- Bug with initialization when no text editor is active
- Changed context menu group to "modifications"

## [1.0.0] - [1.0.4]
- Minor readme.md and manifest changes

