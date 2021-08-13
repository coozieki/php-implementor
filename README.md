# php-implementor
Implement php interface/abstract class methods faster!

Currently work in progress.

For the extension to work, your project must follow the PSR-0 autoloading, which means, that if you have a class with a namespace like this:

```php
   <?php 

   namespace App\Controllers;

   class IndexController {

   }
```

IndexController must be located in ___"App/Controllers/IndexController.php"___ file. However, extension allows you to define the location of your "root" namespace. For instance, let's define the location of ___App___ namespace from the example above, as if the ___App___ namespace was located in ___"src/App"___ folder:

```
     "php-implementor.autoloads": {
        "App": "src/App/"
    }
```