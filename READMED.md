# Formulario de reservas de un laboratorio educativo

* Esta es una plaicacion que permite registrar las reservas en un google calendar
* Tambien regitra las reservas en una hola de Google sheet
* Esta aplicacion usa las apis de google sheet y google calendar
* Es necesario que se tenga todo configurado en google console

# Para correr la aplicacion en local

1. Instalar los paquetes de node ```npm install```
2. Crear un archivo ```.env``` para configurar las variables de entorno
3. Debes tener creada una cuenta de servicio en google console
4. Descarga el .json de las credenciales de la cuenta de servicio
5. Dentro del archivo ```.env``` debe tener las siguientes variables.
* GOOGLE_SHEET_ID = El ID de la hoja de calculo donde necesitamos los registros
* GOOGLE_CALENDAR_ID = El ID del calendario donde queremos los eventos
* GOOGLE_CREDENTIALS = 'Todo el contenido del archivo de credenciales .JSON de Google'
6. Despues de configurar todo, en el Frond, cambiar las rutas de peticiones a local
7. node server.js en la terminal
