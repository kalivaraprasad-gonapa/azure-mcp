import logging
import coloredlogs
from flask import has_request_context, request
import os
import sys
from dotenv import load_dotenv

load_dotenv(verbose=True)

PYTHON_LOG_LEVEL = os.getenv("PYTHON_LOG_LEVEL", "DEBUG")

log = logging.getLogger()
handler = logging.StreamHandler()  # sys.stderr will be used by default


class RequestFormatter(coloredlogs.ColoredFormatter):
    """
    Custom log formatter that adds request-specific information (URL, remote address)
    to log records if the log message is emitted within a Flask request context.
    """
    def format(self, record):
        """
        Formats the log record.
        
        Adds 'url' and 'remote_addr' to the record if available from the request context.
        
        Args:
            record (logging.LogRecord): The log record to format.
            
        Returns:
            str: The formatted log message.
        """
        if has_request_context():
            record.url = request.url
            record.remote_addr = request.remote_addr
        else:
            record.url = None
            record.remote_addr = None

        return super().format(record)


formatter = RequestFormatter(
    "[%(asctime)s] %(remote_addr)s requested %(url)s %(name)-12s %(levelname)-8s %(message)s %(funcName)s %(pathname)s:%(lineno)d"  # noqa
)

handler.setFormatter(formatter)
handler.setLevel(PYTHON_LOG_LEVEL)  # Both loggers and handlers have a setLevel method
log.addHandler(handler)
log.setLevel(PYTHON_LOG_LEVEL)


# Log all uncuaght exceptions
def handle_exception(exc_type, exc_value, exc_traceback):
    """
    Global exception handler to log all uncaught exceptions.
    
    If the exception is a KeyboardInterrupt, it respects the default system behavior.
    Otherwise, it logs the exception as critical.
    
    Args:
        exc_type (type): The type of the exception.
        exc_value (Exception): The exception instance.
        exc_traceback (traceback): A traceback object encapsulating the call stack at
                                   the point where the exception originally occurred.
    """
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return

    log.critical("Uncaught exception", exc_info=(exc_type, exc_value, exc_traceback))


sys.excepthook = handle_exception
