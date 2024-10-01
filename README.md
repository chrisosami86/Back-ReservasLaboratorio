# Formulario de registro de alimentación (Backend)

* Esta es una aplicación que permite registrar las reservas en un Google calendar
* También registra las reservas en una hoja de Google Sheet
* Esta aplicación usa las Apis de Google Sheet y Google calendar
* Es necesario que se tenga todo configurado en Google Console

# Para correr la aplicación en local

**1.** Instalar los paquetes de Node ```npm install```

**2.** Crear un archivo ```.env``` para configurar las variables de entorno

**3.** Debes tener creada una cuenta de servicio en Google Console

**4.** Descarga él .JSON de las credenciales de la cuenta de servicio

**5.** Dentro del archivo ```.env``` debe tener las siguientes variables.

* GOOGLE_SHEET_ID = El ID de la hoja de cálculo donde necesitamos los registros.

* GOOGLE_CALENDAR_ID = El ID del calendario donde queremos los eventos

* GOOGLE_CREDENTIALS = 'Todo el contenido del archivo de credenciales .JSON de Google'

**6.** Después de configurar todo, en el Frond, cambiar las rutas de peticiones a local

**7.** Node server.js en la terminal